import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ImageCropModalProps {
    imageSrc: string;
    onConfirm: (blob: Blob) => void;
    onCancel: () => void;
}

const MAX_CANVAS_W = 440;
const MAX_CANVAS_H = 480;
const MIN_CROP = 60;

export const ImageCropModal: React.FC<ImageCropModalProps> = ({ imageSrc, onConfirm, onCancel }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const [canvasSize, setCanvasSize] = useState({ w: MAX_CANVAS_W, h: MAX_CANVAS_W });
    const [crop, setCrop] = useState({ x: 80, y: 80, size: 240 });
    const dragState = useRef<{ type: 'move' | 'resize'; startX: number; startY: number; startCrop: typeof crop } | null>(null);

    const handleImageLoad = useCallback(() => {
        const img = imgRef.current;
        if (!img) return;
        const ratio = img.naturalHeight / img.naturalWidth;
        let w = MAX_CANVAS_W;
        let h = Math.round(w * ratio);
        if (h > MAX_CANVAS_H) {
            h = MAX_CANVAS_H;
            w = Math.round(h / ratio);
        }
        if (h < 200) h = 200;
        setCanvasSize({ w, h });
        const initSize = Math.round(Math.min(w, h) * 0.65);
        const initX = Math.round((w - initSize) / 2);
        const initY = Math.round((h - initSize) / 2);
        setCrop({ x: initX, y: initY, size: initSize });
    }, []);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;
        const { w, h } = { w: canvas.width, h: canvas.height };
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, w, h);

        // Draw image at natural aspect ratio filling canvas
        ctx.drawImage(img, 0, 0, w, h);

        // Dim outside crop circle
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, w, h);
        const cx = crop.x + crop.size / 2;
        const cy = crop.y + crop.size / 2;
        const r = crop.size / 2;

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Redraw image inside circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, 0, 0, w, h);
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
    }, [draw, canvasSize]);

    const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const scaleX = canvasRef.current!.width / rect.width;
        const scaleY = canvasRef.current!.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
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
        const { w, h } = canvasSize;

        if (dragState.current.type === 'move') {
            const nx = Math.max(0, Math.min(w - sc.size, sc.x + dx));
            const ny = Math.max(0, Math.min(h - sc.size, sc.y + dy));
            setCrop(c => ({ ...c, x: nx, y: ny }));
        } else {
            const delta = (dx + dy) / 2;
            const maxSize = Math.min(w, h);
            const newSize = Math.max(MIN_CROP, Math.min(maxSize, sc.size + delta * 1.4));
            const nx = Math.max(0, Math.min(w - newSize, sc.x));
            const ny = Math.max(0, Math.min(h - newSize, sc.y));
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

        // Map from canvas coords to actual image coords
        const scaleX = img.naturalWidth / canvasSize.w;
        const scaleY = img.naturalHeight / canvasSize.h;
        const sx = crop.x * scaleX;
        const sy = crop.y * scaleY;
        const sw = crop.size * scaleX;
        const sh = crop.size * scaleY;

        const out = document.createElement('canvas');
        const outSize = 256;
        out.width = outSize;
        out.height = outSize;
        const ctx = out.getContext('2d')!;

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
                    width={canvasSize.w}
                    height={canvasSize.h}
                    style={{ borderRadius: '12px', display: 'block', cursor: 'default', maxWidth: '100%' }}
                    onMouseDown={onMouseDown}
                    onMouseMove={(e) => {
                        onMouseMove(e);
                        e.currentTarget.style.cursor = getCursor(e);
                    }}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                />
                <img
                    ref={imgRef}
                    src={imageSrc}
                    style={{ display: 'none' }}
                    onLoad={handleImageLoad}
                />
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline" onClick={onCancel}>キャンセル</button>
                    <button className="btn btn-primary" onClick={handleConfirm}>この範囲でアップロード</button>
                </div>
            </div>
        </div>
    );
};
