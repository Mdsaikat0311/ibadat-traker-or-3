import React, { useState } from 'react';
import { BookOpen, NotebookText, Trash2, Lock } from 'lucide-react';
import { DuaNote } from '../types/ibadat';
import { CustomAlertDialog } from '../components/dialogs/CustomAlertDialog';

interface NotesScreenProps {
  duaNotes: DuaNote[];
  onAddNote: (title: string, text: string) => void;
  onDeleteNote: (id: string) => void;
  onOpenNoteDetail?: (note: DuaNote) => void;
}

export const NotesScreen: React.FC<NotesScreenProps> = ({
  duaNotes,
  onAddNote,
  onDeleteNote
}) => {
  const [titleInput, setTitleInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<{ id: string; title: string } | null>(null);

  const manualNotes = React.useMemo(() => {
    const map = new Map<string, DuaNote>();
    duaNotes.forEach((n) => {
      if (n && n.id && !n.isAuto && !n.id.startsWith('auto_')) {
        map.set(n.id, n);
      }
    });
    return Array.from(map.values());
  }, [duaNotes]);

  const autoNotes = React.useMemo(() => {
    const map = new Map<string, DuaNote>();
    duaNotes.forEach((n) => {
      if (n && n.id && (n.isAuto || n.id.startsWith('auto_'))) {
        map.set(n.id, n);
      }
    });
    return Array.from(map.values());
  }, [duaNotes]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    onAddNote(titleInput, textInput);
    setTitleInput('');
    setTextInput('');
  };

  const renderNoteCard = (note: DuaNote) => {
    const isAutoNote = note.isAuto || note.id.startsWith('auto_');

    return (
      <div
        key={note.id}
        className="w-full rounded-2xl border border-teal-300 bg-white px-4 py-3 shadow-xs"
      >
        <div className="flex justify-between items-center mb-1.5">
          <span className="font-bold text-gray-800 text-[16px] truncate pr-2">
            {isAutoNote ? 'স্বয়ংক্রিয় নোট' : (note.title || note.date)}
          </span>

          {isAutoNote ? (
            <span title="মুছে ফেলা যাবে না">
              <Lock className="w-4 h-4 text-gray-400 shrink-0" />
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setNoteToDelete({ id: note.id, title: note.title || 'নোটটি' })}
              className="shrink-0 text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition cursor-pointer"
              title="মুছে ফেলুন"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
          {note.text}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-20">
      {/* New Note Form */}
      <div className="bg-white p-4 rounded-xl shadow-xs border border-gray-200">
        <h2 className="text-sm font-bold text-gray-700 mb-2">নতুন নোট লিখুন</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            id="new-note-head-input"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            className="w-full p-2.5 mb-2 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-1 focus:ring-teal-500 focus:outline-hidden text-sm text-gray-800 placeholder-gray-400"
            placeholder="হেড/শিরোনাম (ঐচ্ছিক)"
          />
          <textarea
            id="new-note-input"
            rows={2}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            className="w-full p-2.5 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-1 focus:ring-teal-500 focus:outline-hidden text-sm text-gray-800 placeholder-gray-400 resize-none"
            placeholder="এখানে লিখুন..."
          />
          <div className="flex justify-end mt-2 pt-1">
            <button
              type="submit"
              className="px-4 py-1.5 bg-teal-600 text-white text-xs rounded-md hover:bg-teal-700 transition font-medium shadow-xs cursor-pointer"
            >
              সেভ করুন
            </button>
          </div>
        </form>
      </div>

      {/* Manual Notes */}
      <div>
        <h2 className="text-base font-bold text-gray-800 mb-2.5 flex items-center">
          <NotebookText className="w-4 h-4 mr-2 text-teal-600" />
          <span>আমার নোটস ({manualNotes.length})</span>
        </h2>
        <div className="grid grid-cols-1 gap-3">
          {manualNotes.length === 0 ? (
            <div className="p-3.5 bg-white border border-gray-200 rounded-xl text-center text-xs text-gray-500">
              এখনও কোনো নোট যোগ করা হয়নি। উপরের বক্সে লিখে সেভ করুন।
            </div>
          ) : (
            manualNotes.map(renderNoteCard)
          )}
        </div>
      </div>

      {/* Library Notes */}
      <div className="pt-1">
        <h2 className="text-base font-bold text-gray-800 mb-2.5 flex items-center">
          <BookOpen className="w-4 h-4 mr-2 text-blue-600" />
          <span>স্বয়ংক্রিয় লাইব্রেরি নোটস ({autoNotes.length})</span>
        </h2>
        <div className="grid grid-cols-1 gap-3">
          {autoNotes.map(renderNoteCard)}
        </div>
      </div>

      {/* Delete Confirmation Alert */}
      {noteToDelete && (
        <CustomAlertDialog
          title="নোট মুছে ফেলা"
          message={`আপনি কি নিশ্চিত যে আপনি এই নোটটি মুছে ফেলতে চান?`}
          isSuccess={false}
          isConfirm={true}
          onConfirm={() => {
            onDeleteNote(noteToDelete.id);
            setNoteToDelete(null);
          }}
          onDismiss={() => setNoteToDelete(null)}
        />
      )}
    </div>
  );
};
