'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

type NotificationType = 'success' | 'error' | 'info';

interface NotificationContextType {
  showNotification: (title: string, message: string, type?: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<NotificationType>('info');
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const showNotification = useCallback((newTitle: string, newMessage: string, newType: NotificationType = 'info') => {
    // Clear existing timeout so the timer resets if a new notification comes in
    if (timeoutId) clearTimeout(timeoutId);

    setTitle(newTitle);
    setMessage(newMessage);
    setType(newType);
    setVisible(true);

    // Auto-hide after 5 seconds
    const id = setTimeout(() => {
      setVisible(false);
    }, 5000);
    
    setTimeoutId(id);
  }, [timeoutId]);

  const closeNotification = () => {
    setVisible(false);
    if (timeoutId) clearTimeout(timeoutId);
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      
      {/* --- macOS Style Floating Banner --- */}
      <div 
        className={`fixed top-5 right-5 z-[9999] transition-all duration-500 ease-in-out transform ${
          visible ? 'translate-x-0 opacity-100' : 'translate-x-10 opacity-0 pointer-events-none'
        }`}
      >
        <div className="w-96 bg-white/95 backdrop-blur-md border border-gray-200 shadow-2xl rounded-xl overflow-hidden flex items-stretch">
          {/* Colored Strip & Icon */}
          <div className={`w-14 flex items-center justify-center ${
            type === 'success' ? 'bg-green-50' : 
            type === 'error' ? 'bg-red-50' : 'bg-blue-50'
          }`}>
            {type === 'success' && <CheckCircle className="text-green-600 h-6 w-6" />}
            {type === 'error' && <XCircle className="text-red-600 h-6 w-6" />}
            {type === 'info' && <Info className="text-blue-600 h-6 w-6" />}
          </div>

          {/* Content */}
          <div className="flex-1 p-4 min-w-0">
            <div className="flex justify-between items-start">
              <h4 className="text-sm font-bold text-gray-900">{title}</h4>
              <button onClick={closeNotification} className="text-gray-400 hover:text-gray-600 transition-colors -mt-1 -mr-1">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-1 leading-snug">
              {message}
            </p>
          </div>
        </div>
      </div>
    </NotificationContext.Provider>
  );
}