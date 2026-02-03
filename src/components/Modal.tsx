import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.removeEventListener("keydown", handleEscape);
            document.body.style.overflow = "unset";
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                ref={dialogRef}
                className="bg-[#1a1b1e] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-800 animate-in zoom-in-95 duration-200"
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                    <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
}
