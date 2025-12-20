"use client";

import { useState, useEffect } from "react";

interface NoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    postingNumber: string;
    initialNote: string | null;
    onSave: (note: string) => Promise<void>;
}

export default function NoteModal({ isOpen, onClose, postingNumber, initialNote, onSave }: NoteModalProps) {
    const [note, setNote] = useState(initialNote || "");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setNote(initialNote || "");
    }, [initialNote, isOpen]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(note);
            onClose();
        } catch (error) {
            console.error("Note save error:", error);
        } finally {
            setSaving(false);
        }
    };

    const handleClear = async () => {
        setSaving(true);
        try {
            await onSave("");
            setNote("");
            onClose();
        } catch (error) {
            console.error("Note clear error:", error);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-white">Sipariş Notu</h3>
                            <p className="text-sm text-indigo-200 mt-0.5">{postingNumber}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Not
                    </label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Bu sipariş için not ekleyin..."
                        className="w-full h-40 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                        disabled={saving}
                        autoFocus
                    />
                    <p className="mt-2 text-xs text-gray-400">
                        {note.length} karakter
                    </p>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
                    <div>
                        {initialNote && (
                            <button
                                onClick={handleClear}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                            >
                                Notu Sil
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            disabled={saving}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                            İptal
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Kaydediliyor...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Kaydet
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
