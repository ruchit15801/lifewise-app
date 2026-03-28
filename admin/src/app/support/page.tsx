"use client";

import { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import MainLayout from "@/components/MainLayout";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  MessageSquare, 
  User, 
  Clock, 
  Send, 
  CheckCheck,
  MoreVertical,
  Paperclip,
  ChevronRight,
  ShieldAlert,
  Filter,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { getApiUrl, getSocketUrl } from "@/lib/api-config";
import { io } from "socket.io-client";

export default function SupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const chartEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef<any>(null);
  const [showMenu, setShowMenu] = useState<string | null>(null);
  const [showDetailView, setShowDetailView] = useState(false);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const res = await fetch(getApiUrl("/api/admin/support/tickets") + (searchTerm ? `?search=${searchTerm}` : ""), {
          headers: {
            "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
          }
        });
        const data = await res.json();
        setTickets(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to fetch tickets", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [searchTerm]);

  useEffect(() => {
    const socketUrl = getSocketUrl();
    socketRef.current = io(socketUrl);

    socketRef.current.on("new-message", (msg: any) => {
      setMessages((prev) => {
        if (prev.find(m => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
      
      // Auto-read if selected
      if (selectedTicket && msg.ticketId === selectedTicket._id && msg.senderType === 'user') {
        socketRef.current.emit("message-read", { ticketId: msg.ticketId, messageId: msg._id });
      }
    });

    socketRef.current.on("message-status-update", ({ messageId, status }: any) => {
      setMessages((prev) => prev.map(m => m._id === messageId ? { ...m, status } : m));
    });

    socketRef.current.on("typing-status", ({ isTyping, senderType }: any) => {
      if (senderType === 'user') {
        setPartnerTyping(isTyping);
      }
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [selectedTicket]);

  useEffect(() => {
    if (selectedTicket) {
      const fetchMessages = async () => {
        try {
          const res = await fetch(getApiUrl(`/api/admin/support/tickets/${selectedTicket._id}/messages`), {
            headers: {
              "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
            }
          });
          const data = await res.json();
          setMessages(data);
          
          socketRef.current.emit("join-ticket", selectedTicket._id);
          
          // Mark all user messages as read
          data.forEach((m: any) => {
            if (m.senderType === 'user' && m.status !== 'read') {
              socketRef.current.emit("message-read", { ticketId: selectedTicket._id, messageId: m._id });
            }
          });
        } catch (err) {
          console.error("Failed to fetch messages", err);
        }
      };
      
      fetchMessages();
    }
  }, [selectedTicket]);

  useEffect(() => {
    chartEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, partnerTyping]);

  const handleSendMessage = (e?: React.FormEvent, mediaData?: { url: string, type: string }) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() && !mediaData) return;
    if (!selectedTicket) return;

    const adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

    socketRef.current.emit("send-message", {
      ticketId: selectedTicket._id,
      userId: adminUser._id || adminUser.id || "admin",
      content: newMessage,
      senderType: "admin",
      type: mediaData ? 'media' : 'text',
      mediaUrl: mediaData?.url,
      mediaType: mediaData?.type
    });

    // Auto update ticket status to in_progress locally for immediate feedback
    setTickets((prev: any[]) => prev.map(t => t._id === selectedTicket._id ? { ...t, status: 'in_progress', updatedAt: new Date() } : t));
    setSelectedTicket((prev: any) => prev?._id === selectedTicket._id ? { ...prev, status: 'in_progress' } : prev);

    setNewMessage("");
    setIsTyping(false);
    socketRef.current.emit("typing", { ticketId: selectedTicket._id, isTyping: false, senderType: 'admin' });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(getApiUrl("/api/admin/support/upload"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
        },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        handleSendMessage(undefined, { url: data.url, type: data.type });
      }
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    
    if (!isTyping && selectedTicket) {
      setIsTyping(true);
      socketRef.current.emit("typing", { ticketId: selectedTicket._id, isTyping: true, senderType: 'admin' });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (selectedTicket) {
        socketRef.current.emit("typing", { ticketId: selectedTicket._id, isTyping: false, senderType: 'admin' });
      }
    }, 2000);
  };

  const handleResolve = async () => {
    if (!selectedTicket) return;
    try {
      const res = await fetch(getApiUrl(`/api/admin/support/tickets/${selectedTicket._id}/status`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem("admin_token")}`
        },
        body: JSON.stringify({ status: 'closed' })
      });
      if (res.ok) {
        setSelectedTicket({ ...selectedTicket, status: 'closed' });
        setTickets((prev: any[]) => prev.map(t => t._id === selectedTicket._id ? { ...t, status: 'closed' } : t));
        setShowMenu(null);
      }
    } catch (err) {
      console.error("Failed to resolve ticket", err);
    }
  };

  const handleDeleteTicket = async () => {
    if (!selectedTicket || !window.confirm("Are you sure you want to permanently delete this ticket?")) return;
    try {
      const res = await fetch(getApiUrl(`/api/admin/support/tickets/${selectedTicket._id}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem("admin_token")}`
        }
      });
      if (res.ok) {
        setTickets((prev: any[]) => prev.filter(t => t._id !== selectedTicket._id));
        setSelectedTicket(null);
        setShowMenu(null);
      }
    } catch (err) {
      console.error("Failed to delete ticket", err);
    }
  };

  return (
    <MainLayout>
      <main className="flex p-0">
        <div className="w-80 flex flex-col border-r border-gray-100 bg-gray-50/30">
            <div className="p-6 space-y-4 border-b border-gray-100 bg-white">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-[0.2em] opacity-40 mb-1">Inbound Registry</h2>
              <div className="relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-primary-600 transition-colors" />
                <input 
                  type="text" 
                  placeholder="ID, SUBJECT, OR USER..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-10 pr-4 py-3 text-[11px] focus:ring-4 focus:ring-primary-600/5 focus:bg-white focus:border-primary-600/30 outline-none transition-all font-bold placeholder:text-gray-300"
                />
              </div>
              <div className="flex gap-1.5 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-100">
                {['all', 'active', 'in_progress', 'closed'].map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${statusFilter === status ? 'bg-white text-primary-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'}`}
                  >
                    {status === 'all' ? 'All' : status === 'in_progress' ? 'Prog' : status === 'active' ? 'New' : 'End'}
                  </button>
                ))}
              </div>
            </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar bg-white/40">
            {loading ? (
              <div className="p-6 space-y-4">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex gap-4 animate-pulse">
                    <div className="w-12 h-12 bg-gray-50 rounded-2xl" />
                    <div className="flex-1 space-y-3 mt-1">
                      <div className="h-3 bg-gray-50 rounded-full w-3/4" />
                      <div className="h-2 bg-gray-50 rounded-full w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              tickets
                .filter(t => statusFilter === 'all' || t.status === statusFilter)
                .map((ticket) => (
                <button
                  key={ticket._id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={`w-full p-5 text-left transition-all border-b border-gray-50/50 flex gap-4 relative group ${selectedTicket?._id === ticket._id ? 'bg-white shadow-[0_0_40px_rgba(0,0,0,0.03)] z-10' : 'hover:bg-white/60'}`}
                >
                  {selectedTicket?._id === ticket._id && (
                    <motion.div layoutId="active-ticket" className="absolute left-0 top-4 bottom-4 w-1 bg-primary-600 rounded-r-full" />
                  )}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 transform transition-transform group-hover:scale-105 ${ticket.status === 'active' ? 'bg-amber-500 shadow-lg shadow-amber-500/20' : ticket.status === 'in_progress' ? 'bg-primary-500 shadow-lg shadow-primary-500/20' : 'bg-gray-400 shadow-lg shadow-gray-400/20'}`}>
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h4 className={`text-[11px] font-black text-gray-900 truncate leading-tight tracking-tight ${ticket.status === 'active' ? 'text-primary-900' : ''}`}>{ticket.subject}</h4>
                      <span className="text-[9px] font-bold text-gray-400 whitespace-nowrap uppercase tracking-widest ml-2 opacity-60">
                        {new Date(ticket.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold truncate mt-1 opactiy-80 line-clamp-1">{ticket.description}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest border ${ticket.status === 'active' ? 'bg-amber-50 text-amber-600 border-amber-100' : ticket.status === 'in_progress' ? 'bg-primary-50 text-primary-600 border-primary-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                      {ticket.unreadCount > 0 && (
                        <div className="min-w-[18px] h-[18px] rounded-full bg-red-500 flex items-center justify-center text-[9px] font-black text-white shadow-lg shadow-red-500/30">
                          {ticket.unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
            {!loading && tickets.length === 0 && (
              <div className="p-10 text-center text-gray-400">
                <ShieldAlert className="w-10 h-10 mx-auto mb-4 opacity-20" />
                <p className="text-sm font-medium">No strategic tickets found</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#FDFDFD]">
          {selectedTicket ? (
            <>
              <div className="px-10 py-6 bg-white border-b border-gray-100 flex items-center justify-between shadow-sm z-20 sticky top-0">
                <div className="flex items-center gap-5">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-primary-600 flex items-center justify-center text-white font-black text-xl shadow-xl shadow-primary-600/20 transform rotate-3">
                      {selectedTicket.subject.charAt(0)}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-4 border-white animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-black text-gray-900 text-xl tracking-tight leading-none mb-2">{selectedTicket.subject}</h3>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-black uppercase tracking-[0.15em] bg-emerald-50/50 px-2.5 py-1 rounded-lg border border-emerald-100/50">
                        Secure Connection
                      </div>
                      <span className="text-[10px] text-gray-300 font-black uppercase tracking-[0.2em]">ID • {selectedTicket._id.slice(-8).toUpperCase()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {selectedTicket.status !== 'closed' && (
                    <button 
                      onClick={handleResolve}
                      className="px-6 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-gray-900/10 hover:bg-primary-600 hover:shadow-primary-600/20 transition-all active:scale-95 flex items-center gap-2.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Resolve Protocol
                    </button>
                  )}
                  <div className="relative">
                    <button 
                      onClick={() => setShowMenu(showMenu === selectedTicket._id ? null : selectedTicket._id)}
                      className="p-3 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all border border-gray-100"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    <AnimatePresence>
                      {showMenu === selectedTicket._id && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                          className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-[100]"
                        >
                          <button 
                            onClick={() => { setShowDetailView(true); setShowMenu(null); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-all"
                          >
                            <User className="w-4 h-4 text-primary-600" />
                            View Full Details
                          </button>
                          {selectedTicket.status !== 'closed' && (
                            <button 
                              onClick={handleResolve}
                              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Mark as Resolved
                            </button>
                          )}
                          <div className="my-1 border-t border-gray-50" />
                          <button 
                            onClick={handleDeleteTicket}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <XCircle className="w-4 h-4" />
                            Delete Ticket
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-12 space-y-10 custom-scrollbar bg-gradient-to-b from-gray-50/30 to-white">
                <div className="flex justify-center mb-4">
                  <div className="bg-white border border-gray-100/50 rounded-3xl p-8 max-w-2xl shadow-2xl shadow-gray-200/20 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-primary-600/10" />
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-8 h-8 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center transform transition-transform group-hover:rotate-12">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-black text-gray-400 uppercase tracking-[0.25em]">Initial Briefing Report</span>
                    </div>
                    <p className="text-gray-900 font-bold leading-relaxed text-base italic border-l-4 border-primary-100 pl-6 py-2">
                      "{selectedTicket.description}"
                    </p>
                    <div className="mt-8 pt-6 border-t border-gray-50 flex items-center justify-between text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">
                      <div className="flex items-center gap-2">
                        <span className="text-primary-600/50 underline decoration-dotted offset-4">Category</span>
                        <span className="text-gray-900">{selectedTicket.category || 'General Operations'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>Initiated</span>
                        <span className="text-gray-900">{new Date(selectedTicket.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {messages.map((msg, idx) => {
                  const isAdmin = msg.senderType === "admin";
                  const isMedia = msg.type === "media";
                  
                  return (
                    <motion.div
                      key={msg._id || idx}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[75%] group relative flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                        <div className={`p-4 ${isAdmin 
                          ? 'bg-primary-600 text-white rounded-3xl rounded-tr-none shadow-xl shadow-primary-600/10' 
                          : 'bg-white text-gray-900 border border-gray-100 rounded-3xl rounded-tl-none shadow-xl shadow-gray-200/10'} 
                          ${isMedia ? 'p-2' : ''}`}
                        >
                          {isMedia ? (
                            <div className="space-y-3">
                              {msg.mediaType?.startsWith('image/') ? (
                                <img src={msg.mediaUrl} alt="Attachment" className="max-w-xs rounded-2xl shadow-inner border border-black/5 cursor-pointer hover:opacity-90 transition-all" />
                              ) : (
                                <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className={`flex items-center gap-4 p-5 rounded-2xl ${isAdmin ? 'bg-primary-500' : 'bg-gray-50'} border border-black/5`}>
                                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                                    <Paperclip className="w-5 h-5 flex-shrink-0" />
                                  </div>
                                  <div className="text-left">
                                    <p className="text-sm font-black truncate max-w-[200px]">Strategic Document</p>
                                    <p className="text-[10px] opacity-70 uppercase font-black tracking-widest">{msg.mediaType?.split('/')[1] || 'BINARY'}</p>
                                  </div>
                                </a>
                              )}
                              {msg.content && <p className="text-sm font-bold px-3 pb-1 leading-relaxed">{msg.content}</p>}
                            </div>
                          ) : (
                            <p className="text-sm font-bold leading-relaxed">{msg.content}</p>
                          )}
                        </div>
                        <div className={`flex items-center gap-3 mt-2.5 px-2 ${isAdmin ? 'flex-row-reverse text-primary-400' : 'text-gray-400'}`}>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isAdmin && (
                            <div className="flex items-center -space-x-1.5 translate-y-[-1px]">
                                <CheckCheck className={`w-3.5 h-3.5 ${msg.status === 'read' ? 'text-primary-600' : msg.status === 'delivered' ? 'text-primary-300' : 'text-gray-200'}`} />
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {partnerTyping && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex justify-start"
                  >
                    <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none p-3 shadow-sm flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-primary-300 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 bg-primary-300 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 bg-primary-300 rounded-full animate-bounce" />
                    </div>
                  </motion.div>
                )}
                
                <div ref={chartEndRef} />
              </div>

              <div className="p-10 bg-white border-t border-gray-100/50 backdrop-blur-xl z-20">
                <form 
                  onSubmit={handleSendMessage} 
                  className="flex items-center gap-5 bg-gray-50/50 border border-gray-100 rounded-[2rem] p-4 pr-6 focus-within:bg-white focus-within:ring-[12px] focus-within:ring-primary-600/5 focus-within:border-primary-600/30 transition-all relative shadow-inner"
                >
                  <label className="p-3.5 text-gray-400 hover:text-primary-600 transition-all cursor-pointer hover:bg-white hover:shadow-xl hover:shadow-gray-200/50 rounded-2xl border border-transparent hover:border-gray-100">
                    <Paperclip className="w-6 h-6" />
                    <input type="file" className="hidden" onChange={handleFileUpload} />
                  </label>
                  <input 
                    type="text" 
                    value={newMessage}
                    onChange={handleTyping}
                    placeholder="ENTER PROTOCOL RESPONSE..."
                    className="flex-1 bg-transparent border-none outline-none text-[13px] py-2 font-black text-gray-900 placeholder:text-gray-300 placeholder:uppercase placeholder:tracking-[0.2em]"
                  />
                  <div className="h-10 w-px bg-gray-100" />
                  <button 
                    disabled={!newMessage.trim()}
                    type="submit" 
                    className="flex items-center gap-3 px-8 py-3.5 bg-primary-600 text-white rounded-2xl shadow-2xl shadow-primary-600/30 hover:bg-gray-900 hover:shadow-gray-900/40 transition-all disabled:opacity-20 disabled:shadow-none font-black text-[11px] uppercase tracking-[0.2em] transform active:scale-95 group"
                  >
                    Deploy
                    <Send className="w-4 h-4 ml-1 transform group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </button>
                </form>
              </div>
            </>
          ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-20">
                <div className="w-24 h-24 bg-white border border-gray-50 rounded-[2rem] shadow-2xl shadow-gray-200 flex items-center justify-center text-primary-200 mb-8 transform -rotate-6 group transition-all hover:rotate-0">
                  <MessageSquare className="w-10 h-10 group-hover:scale-110 transition-transform" />
                </div>
                <h2 className="text-2xl font-black text-gray-900 mb-3 tracking-tighter">Support Node Inactive</h2>
                <p className="text-gray-400 max-w-sm leading-relaxed text-sm font-bold">Select a tactical support ticket from the registry to bridge communications and resolve participant issues.</p>
              </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {showDetailView && selectedTicket && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 sm:p-20">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDetailView(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative z-10 border border-white/20"
            >
              <div className="px-10 py-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-5">
                   <div className="w-16 h-16 rounded-[2rem] bg-gray-900 flex items-center justify-center text-white text-2xl font-black shadow-2xl">
                     {selectedTicket.subject.charAt(0)}
                   </div>
                   <div>
                      <h2 className="text-2xl font-black text-gray-900 tracking-tighter">{selectedTicket.subject}</h2>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Operational ID: {selectedTicket._id}</p>
                   </div>
                </div>
                <button 
                  onClick={() => setShowDetailView(false)}
                  className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all border border-gray-100"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-12 custom-scrollbar bg-gray-50/30">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                    <div className="md:col-span-2 space-y-10">
                       <section>
                          <label className="text-[10px] font-black text-primary-600 uppercase tracking-[0.25em] mb-4 block">Strategic Briefing</label>
                          <div className="bg-white border border-gray-100 p-8 rounded-3xl shadow-sm leading-relaxed text-gray-800 font-medium italic">
                            "{selectedTicket.description}"
                          </div>
                       </section>

                       <section>
                          <label className="text-[10px] font-black text-primary-600 uppercase tracking-[0.25em] mb-4 block">Chat History Ledger</label>
                          <div className="space-y-4">
                             {messages.map((m: any, idx: number) => (
                               <div key={idx} className={`flex gap-4 p-4 rounded-2xl border ${m.senderType === 'admin' ? 'bg-primary-50/50 border-primary-100 ml-8' : 'bg-white border-gray-100 mr-8'}`}>
                                  <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white font-bold text-sm ${m.senderType === 'admin' ? 'bg-primary-600' : 'bg-gray-900'}`}>
                                    {m.senderType === 'admin' ? 'A' : 'P'}
                                  </div>
                                  <div>
                                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{m.senderType === 'admin' ? 'Intelligence Hub' : 'Participant'}</p>
                                     <p className="text-sm font-bold text-gray-800">{m.content}</p>
                                     {m.mediaUrl && (
                                       <div className="mt-3">
                                          {m.mediaType?.startsWith('image/') ? (
                                            <img src={m.mediaUrl} className="max-w-xs rounded-xl border border-gray-100 shadow-sm" alt="Document" />
                                          ) : (
                                            <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="text-xs font-black text-primary-600 underline">View System Attachment</a>
                                          )}
                                       </div>
                                     )}
                                  </div>
                               </div>
                             ))}
                          </div>
                       </section>
                    </div>

                    <div className="space-y-8">
                       <div className="bg-white border border-gray-100 p-8 rounded-[2rem] shadow-sm">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 block">Identity Node</label>
                          <div className="flex items-center gap-4 mb-6">
                             <div className="w-12 h-12 bg-primary-100 text-primary-700 rounded-2xl flex items-center justify-center font-black text-lg">
                               {selectedTicket.userName?.charAt(0) || 'U'}
                             </div>
                             <div>
                                <p className="font-black text-gray-900 text-sm leading-none mb-1">{selectedTicket.userName || 'Anonymous'}</p>
                                <p className="text-[10px] font-bold text-gray-400 truncate w-32">{selectedTicket.userEmail}</p>
                             </div>
                          </div>
                          <div className="pt-6 border-t border-gray-50 flex items-center justify-between">
                             <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Metadata Rank</span>
                             <span className="text-[9px] font-black text-primary-600 uppercase tracking-widest bg-primary-50 px-2 py-0.5 rounded">Verified</span>
                          </div>
                       </div>

                       <div className="bg-gray-900 text-white p-8 rounded-[2rem] shadow-xl">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 block">Classification</label>
                          <div className="space-y-5">
                             <div>
                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Category</p>
                                <p className="text-sm font-black text-white">{selectedTicket.category || 'Standard Input'}</p>
                             </div>
                             <div>
                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Priority Level</p>
                                <p className={`text-sm font-black ${selectedTicket.priority === 'high' ? 'text-rose-500' : 'text-emerald-500'}`}>{selectedTicket.priority?.toUpperCase() || 'NORMAL'}</p>
                             </div>
                             <div>
                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Temporal Origin</p>
                                <p className="text-[11px] font-bold text-gray-300">{new Date(selectedTicket.createdAt).toLocaleString()}</p>
                             </div>
                          </div>
                       </div>

                       <button 
                         onClick={handleResolve}
                         className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-emerald-600/20 transition-all flex items-center justify-center gap-3"
                       >
                         <CheckCircle2 className="w-4 h-4" />
                         Resolve Ticket
                       </button>
                    </div>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </MainLayout>
  );
}
