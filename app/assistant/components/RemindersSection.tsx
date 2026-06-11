import React from 'react';
import { ReminderItem } from './ReminderItem';
import { useReminders } from '../_hook/useReminders';

interface RemindersSectionProps {
  onClose: () => void;
}

const RemindersSection: React.FC<RemindersSectionProps> = ({ onClose }) => {
  const { state } = useReminders();
  const reminders = state.reminders.filter(r => !r.isCompleted);

  return (
    <div className="flex flex-col h-full p-6" style={{ background: 'var(--assistant-bg)', color: 'var(--assistant-text)' }}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--assistant-text)' }}>Reminders</h2>
        <button
          onClick={onClose}
          className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition"
        >
          Cerrar
        </button>
      </div>

      <div className="rounded-lg p-4 overflow-y-auto" style={{ background: 'var(--assistant-control-bg)' }}>
        {reminders.map(reminder => (
          <ReminderItem key={reminder.id} reminder={reminder} />
        ))}
      </div>
    </div>
  );
};

export default RemindersSection;
