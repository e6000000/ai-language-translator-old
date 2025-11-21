
import React, { useRef, useEffect } from 'react';

interface LevelMeterProps {
  analyserNode: AnalyserNode;
}

const LevelMeter: React.FC<LevelMeterProps> = ({ analyserNode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !analyserNode) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    analyserNode.fftSize = 256;
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    let animationFrameId: number;

    const draw = () => {
      animationFrameId = requestAnimationFrame(draw);

      analyserNode.getByteFrequencyData(dataArray);

      canvasCtx.fillStyle = 'rgb(30, 41, 59)'; // slate-800
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const avg = sum / bufferLength || 0;
      const normalizedAvg = avg / 255; // Normalize to 0-1 range

      canvasCtx.fillStyle = 'rgb(34, 197, 94)'; // green-500
      canvasCtx.fillRect(0, 0, canvas.width * normalizedAvg, canvas.height);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyserNode]);

  return <canvas ref={canvasRef} width="200" height="20" className="bg-slate-800 rounded-lg" />;
};

export default LevelMeter;
