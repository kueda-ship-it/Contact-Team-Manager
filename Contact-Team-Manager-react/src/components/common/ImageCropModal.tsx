import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ImageCropModalProps {
    imageSrc: string;
    onConfirm: (blob: Blob) => void;
    onCancel: () => void;
}

const PREVIEW_SIZE = 400;
const MIN_CROP = 60;

export const ImageCropModal: React.FC<ImageCropModalProps> = ({ imageSrc, onConfirm, onCancel }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    // crop circle state (in display coords)
    const [crop, setCrop] = useState({ x: 80, y: 80, size: 240 });
    const dragState = useRef<{ type: 'move' | 'resize'; startX: number; startY: number; startCrop: typeof crop } | null>(null);

    // Draw image + crop overlay
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img || !img.complete) return;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

        // Draw image scaled to fit canvas
        ctx.drawImage(img, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

        // Dim outside crop circle
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
        const cx = crop.x + crop.size / 2;
        const cy = crop.y + crop.size / 2;
        const r = crop.size / 2;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Redraw image inside circle (clear reveals bg, need to redraw image)
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
        ctx.restore();

        // Circle border
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Resize handle (bottom-right of circle)
        const hx = cx + r * Math.cos(Math.PI * 0.25);
        const hy = cy + r * Math.sin(Math.PI * 0.25);
        ctx.beginPath();
        ctx.arc(hx, hy, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }, [crop]);

    useEffect(() => {
        draw();
    }, [draw]);

    const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const isOnHandle = (px: number, py: number) => {
        const cx = crop.x + crop.size / 2;
        const cy = crop.y + crop.size / 2;
        const r = crop.size / 2;
        const hx = cx + r * Math.cos(Math.PI * 0.25);
        const hy = cy + r * Math.sin(Math.PI * 0.25);
        return Math.hypot(px - hx, py - hy) <= 10;
    };

    const isInsideCircle = (px: number, py: number) => {
        const cx = crop.x + crop.size / 2;
        const cy = crop.y + crop.size / 2;
        return Math.hypot(px - cx, py - cy) <= crop.size / 2;
    };

    const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const { x, y } = getPos(e);
        if (isOnHandle(x, y)) {
            dragState.current = { type: 'resize', startX: x, startY: y, startCrop: { ...crop } };
        } else if (isInsideCircle(x, y)) {
            dragState.current = { type: 'move', startX: x, startY: y, startCrop: { ...crop } };
        }
    };

    const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!dragState.current) return;
        const { x, y } = getPos(e);
        const dx = x - dragState.current.startX;
        const dy = y - dragState.current.startY;
        const sc = dragState.current.startCrop;

        if (dragState.current.type === 'move') {
            const nx = Math.max(0, Math.min(PREVIEW_SIZE - sc.size, sc.x + dx));
            const ny = Math.max(0, Math.min(PREVIEW_SIZE - sc.size, sc.y + dy));
            setCrop(c => ({ ...c, x: nx, y: ny }));
        } else {
            const delta = (dx + dy) / 2;
            const newSize = Math.max(MIN_CROP, Math.min(PREVIEW_SIZE, sc.size + delta * 1.4));
            const nx = Math.max(0, Math.min(PREVIEW_SIZE - newSize, sc.x));
            const ny = Math.max(0, Math.min(PREVIEW_SIZE - newSize, sc.y));
            setCrop({ x: nx, y: ny, size: newSize });
        }
    };

    const onMouseUp = () => { dragState.current = null; };

    const getCursor = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const { x, y } = getPos(e);
        if (isOnHandle(x, y)) return 'nwse-resize';
        if (isInsideCircle(x, y)) return 'move';
        return 'default';
    };

    const handleConfirm = () => {
        const img = imgRef.current;
        if (!img) return;

        // Scale from display coords to actual image coords
        const scaleX = img.naturalWidth / PREVIEW_SIZE;
        const scaleY = img.naturalHeight / PREVIEW_SIZE;
        const sx = crop.x * scaleX;
        const sy = crop.y * scaleY;
        const sw = crop.size * scaleX;
        const sh = crop.size * scaleY;

        const out = document.createElement('canvas');
        const outSize = 256;
        out.width = outSize;
        out.height = outSize;
        const ctx = out.getContext('2d')!;

        // Clip to circle
        ctx.beginPath();
        ctx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outSize, outSize);

        out.toBlob(blob => { if (blob) onConfirm(blob); }, 'image/png');
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
            <div style={{
                background: 'var(--bg-secondary, #2a2b3d)', borderRadius: '16px',
                padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
            }}>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main, #fff)' }}>
                    アイコン範囲を選択
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #aaa)' }}>
                    円をドラッグして移動・右下ハンドルでサイズ変更
                </div>
                <canvas
                    ref={canvasRef}
                    width={PREVIEW_SIZE}
                    height={PREVIEW_SIZE}
                    style={{ borderRadius: '12px', display: 'block', cursor: 'default' }}
                    onMouseDown={onMouseDown}
                    onMouseMove={(e) => {
                        onMouseMove(e);
                        e.currentTarget.style.cursor = getCursor(e);
                    }}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                />
                {/* hidden img for drawing */}
                <img
                    ref={imgRef}
                    src={imageSrc}
                    style={{ display: 'none' }}
                    onLoad={draw}
                    crossOrigin="anonymous"
                />
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline" onClick={onCancel}>キャンセル</button>
                    <button className="btn btn-primary" onClick={handleConfirm}>この範囲でアップロード</button>
                </div>
            </div>
        </div>
    );
};
