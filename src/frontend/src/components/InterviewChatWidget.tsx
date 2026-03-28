import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { MessageCircle, X, Send, User, ChevronLeft } from 'lucide-react';
import { api, useAuth } from '../lib/api';
import { cn } from '../lib/utils';
import type { Application } from '../pages/Applications.tsx';

interface ChatMessage {
    id: string;
    applicationId: string;
    senderType: 'user' | 'admin';
    senderId: string;
    senderUsername?: string | null;
    content: string;
    createdAt: string;
}

export function InterviewChatWidget() {
    const { data: user } = useAuth();
    const canUseInterviewChat = !!user?.permissions?.includes('site:applications:view');
    const queryClient = useQueryClient();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [activeChat, setActiveChat] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Resizable state
    const [size, setSize] = useState({ width: 400, height: 520 });
    const isResizing = useRef(false);
    const startPos = useRef({ x: 0, y: 0, w: 0, h: 0 });

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        startPos.current = { x: e.clientX, y: e.clientY, w: size.width, h: size.height };

        const handleMove = (ev: MouseEvent) => {
            if (!isResizing.current) return;
            const dw = startPos.current.x - ev.clientX;
            const dh = startPos.current.y - ev.clientY;
            setSize({
                width: Math.max(360, Math.min(700, startPos.current.w + dw)),
                height: Math.max(400, Math.min(800, startPos.current.h + dh)),
            });
        };

        const handleUp = () => {
            isResizing.current = false;
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
        };

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
    }, [size]);

    // Fetch ALL applications with interview/interview_ready status — visible to all admins
    const { data: applications } = useQuery<Application[]>({
        queryKey: ['applications'],
        queryFn: async () => {
            const { data } = await api.get('/api/applications');
            return data;
        },
        enabled: canUseInterviewChat,
    });

    const interviewApps = applications?.filter(app =>
        app.status === 'interview_ready' || app.status === 'interview'
    ) || [];

    const activeApp = interviewApps.find(a => a.id === activeChat);

    useEffect(() => {
        if (!canUseInterviewChat) return;
        const HOST_URL = typeof window !== 'undefined' ? window.location.origin.replace('admin.', '') : 'http://localhost:3000';

        const newSocket = io(import.meta.env.VITE_API_URL || HOST_URL, {
            withCredentials: true,
            transports: ['websocket', 'polling']
        });

        newSocket.on('connect', () => console.log('✅ WS Connected to Chat'));

        newSocket.on('applications_refresh', () => {
            queryClient.invalidateQueries({ queryKey: ['applications'] });
        });

        setSocket(newSocket);
        return () => { newSocket.close(); };
    }, [canUseInterviewChat, queryClient]);

    // Handle incoming messages for the active chat
    useEffect(() => {
        if (!canUseInterviewChat) return;
        if (!socket || !activeChat) return;

        const handleNewMessage = (msg: ChatMessage) => {
            setMessages(prev => {
                // Prevent duplicates
                if (prev.some(m => m.id === msg.id)) return prev;
                return [...prev, msg];
            });
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        };

        socket.on(`interview_message_${activeChat}`, handleNewMessage);
        return () => {
            socket.off(`interview_message_${activeChat}`, handleNewMessage);
        };
    }, [canUseInterviewChat, socket, activeChat]);

    // Fetch initial chat history when activeChat changes (persists across close/reopen)
    useEffect(() => {
        if (!canUseInterviewChat) return;
        if (!activeChat) return;
        api.get(`/api/applications/${activeChat}/messages`).then(res => {
            setMessages(res.data);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        });
    }, [canUseInterviewChat, activeChat]);

    // Clear activeChat if the application is no longer in interview status (accepted/rejected)
    useEffect(() => {
        if (activeChat && !interviewApps.find(a => a.id === activeChat)) {
            setActiveChat(null);
            setMessages([]);
        }
    }, [interviewApps, activeChat]);

    const sendMessageMutation = useMutation({
        mutationFn: async (content: string) => {
            if (!activeChat) throw new Error('No active chat');
            const { data } = await api.post(`/api/applications/${activeChat}/messages`, { content });
            return data;
        },
        onSuccess: () => {
            setNewMessage('');
        }
    });

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim() && activeChat) {
            sendMessageMutation.mutate(newMessage);
        }
    };

    if (!canUseInterviewChat || interviewApps.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {isOpen && (
                <div
                    className="bg-white border text-slate-900 border-slate-200 shadow-2xl rounded-2xl mb-4 overflow-hidden flex flex-col animate-in slide-in-from-bottom-5 fade-in duration-300 relative"
                    style={{ width: size.width, height: size.height }}
                >
                    {/* Resize handle (top-left corner) */}
                    <div
                        className="absolute top-0 left-0 w-5 h-5 cursor-nw-resize z-20 group"
                        onMouseDown={handleResizeStart}
                    >
                        <div className="absolute top-1.5 left-1.5 w-2.5 h-2.5 border-l-2 border-t-2 border-slate-300 group-hover:border-indigo-400 rounded-tl-sm transition-colors" />
                    </div>

                    <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-4 flex justify-between items-center shadow-md z-10">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            {activeChat && (
                                <button onClick={() => setActiveChat(null)} className="text-slate-300 hover:text-white transition-colors shrink-0 bg-white/10 hover:bg-white/20 p-1 rounded-lg">
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                            )}
                            <div className="min-w-0">
                                <span className="font-bold text-sm tracking-wide block truncate">
                                    {activeApp ? `Чат: ${activeApp.discordUsername}` : 'Обзвоны'}
                                </span>
                                {activeApp && <span className="text-[10px] text-indigo-300 font-mono">{activeApp.discordId}</span>}
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-slate-300 hover:text-rose-400 transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-lg backdrop-blur-sm shrink-0 ml-2">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {!activeChat ? (
                        <div className="flex-1 overflow-y-auto p-3 bg-slate-50/50 custom-scrollbar space-y-2">
                            {interviewApps.map(app => (
                                <button
                                    key={app.id}
                                    onClick={() => setActiveChat(app.id)}
                                    className="w-full text-left p-3.5 bg-white rounded-xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] border border-slate-100 hover:border-indigo-300 hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-between group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
                                            <User className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="text-[14px] font-bold text-slate-800 tracking-tight">{app.discordUsername}</div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <div className={cn("w-2 h-2 rounded-full", app.status === 'interview_ready' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500')} />
                                                <span className="text-[11px] text-slate-500 font-medium">
                                                    {app.status === 'interview_ready' ? 'Готов к обзвону' : 'Ожидает обзвона'}
                                                </span>
                                            </div>
                                            {app.handledByAdminUsername && (
                                                <div className="text-[10px] text-slate-400 mt-0.5">
                                                    Решает: <span className="font-semibold text-slate-600">{app.handledByAdminUsername}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-slate-50 group-hover:bg-indigo-50 flex items-center justify-center transition-colors">
                                        <MessageCircle className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col bg-[#f8fafc] overflow-hidden relative">
                            {/* Background pattern */}
                            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3 z-10">
                                {messages.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                        <MessageCircle className="w-12 h-12 mb-3 text-slate-300" />
                                        <p className="text-xs font-medium text-center px-4 leading-relaxed">Кандидат уведомлен. Здесь появится история переписки.</p>
                                    </div>
                                ) : (
                                    messages.map((m) => {
                                        const isAdmin = m.senderType === 'admin';
                                        return (
                                            <div key={m.id} className={cn("flex w-full", isAdmin ? "justify-end" : "justify-start")}>
                                                <div className={cn(
                                                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] shadow-sm leading-relaxed relative",
                                                    isAdmin ? "bg-indigo-600 text-white rounded-br-sm" : "bg-white border border-slate-200/60 text-slate-800 rounded-bl-sm"
                                                )}>
                                                    {isAdmin && m.senderUsername && (
                                                        <span className="block text-[10px] font-bold opacity-70 mb-0.5">
                                                            {m.senderUsername}
                                                        </span>
                                                    )}
                                                    {m.content}
                                                    <span className={cn(
                                                        "block text-[9px] mt-1 text-right font-medium opacity-70",
                                                    )}>
                                                        {new Date(m.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                            <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200/80 flex gap-2 z-10">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={e => setNewMessage(e.target.value)}
                                    placeholder="Введите сообщение..."
                                    className="flex-1 border-none bg-slate-100/80 rounded-xl px-4 py-3 text-[13.5px] font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:bg-white transition-all placeholder:text-slate-400"
                                    disabled={sendMessageMutation.isPending}
                                />
                                <button
                                    type="submit"
                                    className="bg-indigo-600 text-white w-12 rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center shadow-lg shadow-indigo-600/30 active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:active:scale-100"
                                    disabled={!newMessage.trim() || sendMessageMutation.isPending}
                                >
                                    <Send className="w-4.5 h-4.5 translate-x-[-1px] translate-y-[1px]" />
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            )}

            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "relative text-white w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all outline-none duration-300 group",
                    isOpen ? "bg-slate-800 shadow-slate-900/20" : "bg-indigo-600 shadow-indigo-600/30"
                )}
            >
                {!isOpen && interviewApps.some(a => a.status === 'interview_ready') && (
                    <div className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[11px] font-black w-6 h-6 flex items-center justify-center rounded-full ring-[3px] ring-white shadow-sm animate-bounce">
                        {interviewApps.filter(a => a.status === 'interview_ready').length}
                    </div>
                )}
                {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6 group-hover:rotate-12 transition-transform" />}
            </button>
        </div>
    );
}
