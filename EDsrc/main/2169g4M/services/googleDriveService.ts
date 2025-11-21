// Fix: Add declarations for gapi and google to resolve TypeScript errors.
declare const gapi: any;
declare const google: any;

import { GOOGLE_API_KEY, GOOGLE_CLIENT_ID } from '../config';

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// Fix: Use 'any' type for tokenClient as 'google' namespace is not available at compile time.
let tokenClient: any;
let gapiInited = false;
let gisInited = false;

interface UserProfile {
    name: string;
    email: string;
    picture: string;
}

type AuthCallback = (isSignedIn: boolean, user: UserProfile | null) => void;

/**
 * Initializes the GAPI client and GIS token client.
 */
export const initClient = (callback: AuthCallback): Promise<void> => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = () => {
            gapi.load('client', async () => {
                try {
                    await gapi.client.init({
                        apiKey: GOOGLE_API_KEY,
                        discoveryDocs: [DISCOVERY_DOC],
                    });
                    gapiInited = true;

                    tokenClient = google.accounts.oauth2.initTokenClient({
                        client_id: GOOGLE_CLIENT_ID,
                        scope: SCOPES,
                        callback: async (resp) => {
                            if (resp.error) return reject(new Error(resp.error));
                            const user = await getUserProfile();
                            callback(true, user);
                        },
                    });
                    gisInited = true;
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        };
        document.body.appendChild(script);
    });
};

/**
 *  Sign in the user upon button click.
 */
export const signIn = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (!gapiInited || !gisInited) {
            return reject(new Error('GAPI and GIS clients are not initialized.'));
        }
        
        tokenClient.callback = async (resp) => {
            if (resp.error) return reject(new Error(resp.error));
            // No need to call callback here, initClient's callback handles it.
            resolve();
        };

        if (gapi.client.getToken() === null) {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            tokenClient.requestAccessToken({ prompt: '' });
        }
    });
};

/**
 *  Sign out the user upon button click.
 */
export const signOut = () => {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken(null);
            // The callback in initClient will handle the state update
        });
    }
};

/**
 * Gets the user's profile information.
 */
async function getUserProfile(): Promise<UserProfile | null> {
    try {
        const res = await gapi.client.request({
            path: 'https://www.googleapis.com/oauth2/v2/userinfo',
        });
        const { name, email, picture } = res.result as any;
        return { name, email, picture };
    } catch (e) {
        console.error("Could not fetch user profile", e);
        return null;
    }
}

/**
 * Finds a folder by name within a parent folder.
 */
async function findFolder(name: string, parentId: string = 'root'): Promise<string | null> {
    const res = await gapi.client.drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`,
        fields: 'files(id, name)',
    });
    return res.result.files && res.result.files.length > 0 ? res.result.files[0].id! : null;
}

/**
 * Creates a folder with a given name within a parent folder.
 */
async function createFolder(name: string, parentId: string = 'root'): Promise<string> {
    const res = await gapi.client.drive.files.create({
        resource: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        },
        fields: 'id',
    });
    return res.result.id!;
}

/**
 * Finds or creates a folder by its full path.
 */
const FOLDER_PATH = ['Google AI Studio', 'gemini', 'translive'];
let finalFolderId: string | null = null;
async function getFinalFolderId(): Promise<string> {
    if (finalFolderId) return finalFolderId;

    let parentId = 'root';
    for (const folderName of FOLDER_PATH) {
        let folderId = await findFolder(folderName, parentId);
        if (!folderId) {
            folderId = await createFolder(folderName, parentId);
        }
        parentId = folderId;
    }
    finalFolderId = parentId;
    return finalFolderId;
}

/**
 * Saves a text file to the designated Google Drive folder.
 */
export const saveFile = async (fileName: string, content: string): Promise<void> => {
    const folderId = await getFinalFolderId();
    
    const metadata = {
        name: fileName,
        mimeType: 'text/plain',
        parents: [folderId],
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
        content +
        close_delim;

    await gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartRequestBody,
    });
};
