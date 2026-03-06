'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSpeechRecognition } from '../_hook/useSpeechRecognition';
import MicrophoneIcon from '../_icons/MicrophoneIcon';
import { Message } from '../_types/Message';
import { WRITING } from '../../_constants/chatbot.cons';

interface ChatSectionProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
}

const ChatSection: React.FC<ChatSectionProps> = ({ messages, isLoading, onSendMessage }) => {
  const [inputMessage, setInputMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showVoiceError, setShowVoiceError] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number>(0);

  // para animar solo mensajes nuevos
  const justArrivedId = useMemo(() => {
    const last = messages[messages.length - 1];
    return last?.id;
  }, [messages]);

  const {
    isListening,
    isSupported,
    startListening,
    stopListening,
    error: voiceError,
  } = useSpeechRecognition({
    onResult: (transcript) => {
      setInputMessage(prev => prev + (prev ? ' ' : '') + transcript);
    },
    onError: () => {
      setShowVoiceError(true);
      setTimeout(() => setShowVoiceError(false), 3000);
    },
    continuous: true,
    language: 'es-ES',
  });

  // Auto-resize textarea
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  }, [inputMessage]);

  // Auto-scroll suave cuando llegan mensajes nuevos / loader
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const prev = prevCountRef.current;
    const next = messages.length;

    // solo scrollear cuando aumenta el número de mensajes o cambia isLoading a true
    if (next > prev || isLoading) {
      // espera 1 frame para que el DOM renderice y animaciones calculen height
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      });
    }

    prevCountRef.current = next;
  }, [messages.length, isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputMessage.trim()) {
        onSendMessage(inputMessage);
        setInputMessage('');
      }
    }
  };

  const handleMicrophoneClick = () => {
    if (isListening) stopListening();
    else startListening();
  };

  const canSend = !isLoading && !isListening && !!inputMessage.trim();

  return (
    <div className="bg-gray-900 p-6 md:p-8 flex flex-col justify-end border-t border-gray-700 h-full relative">
      {/* keyframes locales (sin tocar tailwind.config) */}
      <style>{`
          /*  Loader dots (NO quitar) */
          @keyframes dot { 
            0%, 80%, 100% { transform: translateY(0); opacity: .35 } 
            40% { transform: translateY(-4px); opacity: 1 } 
          }

          /*  Entrada premium bot/user */
          @keyframes botIn {
            0%   { opacity:0; transform: translateY(10px) scale(.985); filter: blur(2px); }
            60%  { opacity:1; transform: translateY(-1px) scale(1.004); filter: blur(0px); }
            100% { opacity:1; transform: translateY(0) scale(1); filter: blur(0px); }
          }

          @keyframes userIn {
            0%   { opacity:0; transform: translateY(8px) scale(.99); filter: blur(1px); }
            100% { opacity:1; transform: translateY(0) scale(1); filter: blur(0px); }
          }

          .anim-bot  { animation: botIn  .32s cubic-bezier(.2,.9,.2,1) both; }
          .anim-user { animation: userIn .18s ease-out both; }
        `}</style>

      {/* Indicador de grabación */}
      {isListening && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 z-10">
          <div className="w-2.5 h-2.5 bg-white rounded-full animate-ping"></div>
          <span className="font-medium animate-pulse">Escuchando...</span>
        </div>
      )}

      {/* Mensaje de error */}
      {showVoiceError && voiceError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-5 py-3 rounded-lg shadow-lg z-10 max-w-md text-center">
          <p className="font-medium">{voiceError}</p>
        </div>
      )}

      {/* Mensajes */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto mb-4 p-4 bg-gray-800 rounded-2xl h-full scroll-smooth"
      >
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          const isNew = msg.id === justArrivedId;

          return (
            <div
              key={msg.id}
              className={[
                'flex mb-4',
                isUser ? 'justify-end' : 'justify-start',
              ].join(' ')}
            >
              <div
                  className={[
                    'p-3 rounded-2xl max-w-xs md:max-w-md lg:max-w-lg break-words whitespace-pre-wrap',
                    'shadow-sm shadow-black/20',
                    'will-change-transform',
                    isUser ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200',
                    // ✅ animación premium SOLO cuando es nuevo
                    isNew ? (isUser ? 'anim-user' : 'anim-bot') : '',
                  ].join(' ')}
                  style={
                    // ✅ micro delay para bot (se siente más “humano”)
                    !isUser && isNew ? { animationDelay: '70ms' } : undefined
                  }
                >
                  {msg.text}
                </div>

            </div>
          );
        })}

        {/* Loader premium */}
        {isLoading && (
          <div className="flex justify-start mb-4">
            <div className="p-3 rounded-2xl bg-gray-700 text-gray-200 shadow-sm shadow-black/20 anim-left">
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-80">{WRITING}</span>
                <span className="flex items-center gap-1">
                  <span style={{ animation: 'dot 1s infinite' }} className="w-1.5 h-1.5 bg-white/70 rounded-full" />
                  <span style={{ animation: 'dot 1s infinite .12s' }} className="w-1.5 h-1.5 bg-white/70 rounded-full" />
                  <span style={{ animation: 'dot 1s infinite .24s' }} className="w-1.5 h-1.5 bg-white/70 rounded-full" />
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input row */}
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type here..."
            className={[
              'w-full bg-gray-700 text-white rounded-3xl py-3 px-6 pr-14',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400',
              'resize-none overflow-y-auto text-sm md:text-base',
              'transition-[transform,box-shadow] duration-150',
              'focus:shadow-[0_0_0_4px_rgba(59,130,246,0.15)]',
              isListening ? 'opacity-70' : 'opacity-100',
            ].join(' ')}
            disabled={isLoading || isListening}
            rows={1}
            style={{ minHeight: '48px', maxHeight: '200px' }}
            title="Enter para enviar, Shift+Enter para nueva línea"
          />

          {/* Mic dentro del textarea */}
          {isSupported && (
            <button
              onClick={handleMicrophoneClick}
              className={[
                'absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full',
                'transition-all duration-150 ease-out',
                'active:scale-95',
                isListening
                  ? 'bg-red-600 hover:bg-red-700 shadow-[0_0_0_4px_rgba(239,68,68,0.15)]'
                  : 'bg-gray-600 hover:bg-gray-500',
              ].join(' ')}
              disabled={isLoading}
              title={isListening ? 'Detener grabación' : 'Iniciar dictado por voz'}
            >
              <MicrophoneIcon className={`w-5 h-5 ${isListening ? 'text-white' : 'text-gray-300'}`} />
            </button>
          )}
        </div>

        {/* Send */}
        <button
          onClick={() => {
            if (inputMessage.trim()) {
              onSendMessage(inputMessage);
              setInputMessage('');
            }
          }}
          className={[
            'p-3 rounded-full flex-shrink-0',
            'transition-all duration-150 ease-out',
            'active:scale-95',
            canSend
              ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm shadow-black/30 anim-pop'
              : 'bg-gray-600 text-white/60',
          ].join(' ')}
          disabled={!canSend}
          title="Enviar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ChatSection;
