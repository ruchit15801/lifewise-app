"use client";

import { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
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
  ShieldAlert
} from "lucide-react";
import { io } from "socket.io-client";

export default function SupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const res = await fetch("/api/admin/support/tickets" + (searchTerm ? `?search=${searchTerm}` : ""), {
          headers: {
            "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
          }
        });
        const data = await res.json();
        setTickets(data);
      } catch (err) {
        console.error("Failed to fetch tickets", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [searchTerm]);

  useEffect(() => {
    // Initialize Socket
    const socketUrl = typeof window !== 'undefined' ? (window.location.hostname === 'localhost' ? 'http://localhost:5001' : window.location.origin) : '';
    socketRef.current = io(socketUrl);

    socketRef.current.on("new-message", (msg: any) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      const fetchMessages = async () => {
        try {
          const res = await fetch(`/api/admin/support/tickets/${selectedTicket._id}/messages`, {
            headers: {
              "Authorization": `Bearer ${localStorage.getItem("admin_token")}`
            }
          });
          const data = await res.json();
          setMessages(data);
          
          // Join socket room
          socketRef.current.emit("join-ticket", selectedTicket._id);
        } catch (err) {
          console.error("Failed to fetch messages", err);
        }
      };
      
      fetchMessages();
    }
  }, [selectedTicket]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTicket) return;

    const adminUser = JSON.parse(localStorage.getItem("admin_user") || "{}");

    socketRef.current.emit("send-message", {
      ticketId: selectedTicket._id,
      userId: adminUser.id || "admin",
      content: newMessage,
      senderType: "admin"
    });

    setNewMessage("");
  };

  const handleResolve = async () => {
    if (!selectedTicket) return;
    try {
      const res = await fetch(`/api/admin/support/tickets/${selectedTicket._id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem("admin_token")}`
        },
        body: JSON.stringify({ status: 'closed' })
      });
      if (res.ok) {
        setSelectedTicket({ ...selectedTicket, status: 'closed' });
        setTickets(prev => prev.map(t => t._id === selectedTicket._id ? { ...t, status: 'closed' } : t));
      }
    } catch (err) {
      console.error("Failed to resolve ticket", err);
    }
  };

  return (
    <div className="flex h-screen bg-[#F9FAFB] overflow-hidden">
      <Sidebar />
      
      <main className="flex-1 ml-72 flex p-0">
        {/* Tickets List Section */}
        <div className="w-96 flex flex-col border-r border-gray-100 bg-white">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Support Hub</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search tickets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-600 outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-gray-400 animate-pulse">Loading tickets...</div>
            ) : (
              tickets.map((ticket) => (
                <button
                  key={ticket._id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={`w-full p-6 text-left border-b border-gray-50 transition-all hover:bg-gray-50 flex gap-4 ${selectedTicket?._id === ticket._id ? 'bg-primary-50/50 border-r-2 border-r-primary-600' : ''}`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg ${ticket.status === 'active' ? 'bg-amber-500 shadow-amber-500/20' : 'bg-emerald-500 shadow-emerald-500/20'}`}>
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-gray-900 truncate">{ticket.subject}</h4>
                      <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap uppercase tracking-widest ml-2">
                        {new Date(ticket.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 truncate line-clamp-1">{ticket.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${ticket.status === 'active' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {ticket.status}
                      </span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                        <User className="w-2.5 h-2.5" />
                        {ticket.category}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat Section */}
        <div className="flex-1 flex flex-col bg-gray-50/30">
          {selectedTicket ? (
            <>
              <div className="p-6 bg-white border-b border-gray-100 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold">
                    {selectedTicket.subject.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{selectedTicket.subject}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-widest font-bold">
                      <Clock className="w-3 h-3" />
                      Created {new Date(selectedTicket.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {selectedTicket.status !== 'closed' && (
                    <button 
                      onClick={handleResolve}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold border border-emerald-100 hover:bg-emerald-100 transition-all"
                    >
                      Resolve Ticket
                    </button>
                  )}
                  <button className="p-2 text-gray-400 hover:text-gray-900 transition-all">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-6">
                {/* Initial Description */}
                <div className="flex justify-center mb-10">
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 max-w-xl text-center">
                    <ShieldAlert className="w-6 h-6 text-amber-600 mx-auto mb-2" />
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1">Issue Overview</p>
                    <p className="text-sm text-amber-800 italic">"{selectedTicket.description}"</p>
                  </div>
                </div>

                {messages.map((msg, idx) => {
                  const isAdmin = msg.senderType === "admin";
                  return (
                    <motion.div
                      key={msg._id || idx}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[70%] ${isAdmin ? 'bg-primary-600 text-white rounded-2xl rounded-tr-none shadow-lg shadow-primary-600/20' : 'bg-white text-gray-900 border border-gray-100 rounded-2xl rounded-tl-none shadow-sm shadow-gray-200/50'} p-4`}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        <div className={`flex items-center gap-1.5 mt-2 ${isAdmin ? 'text-primary-100' : 'text-gray-400'}`}>
                          <span className="text-[10px] font-bold uppercase tracking-widest">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isAdmin && (
                            <CheckCheck className={`w-3 h-3 ${msg.status === 'read' ? 'text-white' : 'text-primary-200'}`} />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              <div className="p-6 bg-white border-t border-gray-100">
                <form onSubmit={handleSendMessage} className="flex items-center gap-4 bg-gray-50 border border-gray-100 rounded-2xl p-2 pr-4 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary-600/20 focus-within:border-primary-600 transition-all">
                  <button type="button" className="p-3 text-gray-400 hover:text-gray-600 transition-all">
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <input 
                    type="text" 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your strategic response..."
                    className="flex-1 bg-transparent border-none outline-none text-sm py-2"
                  />
                  <button 
                    disabled={!newMessage.trim()}
                    type="submit" 
                    className="p-3 bg-primary-600 text-white rounded-xl shadow-lg shadow-primary-600/30 hover:bg-primary-700 transition-all disabled:opacity-50 disabled:shadow-none"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <div className="w-24 h-24 bg-primary-50 rounded-full flex items-center justify-center text-primary-300 mb-6">
                <MessageSquare className="w-12 h-12" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Select a Strategic Ticket</h2>
              <p className="text-gray-500 max-w-sm">Choose a communication channel from the sidebar to begin governance protocols and system assistance.</p>
              <div className="mt-8 flex gap-3">
                <div className="px-4 py-2 bg-amber-50 text-amber-700 rounded-full text-xs font-bold border border-amber-100 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                  {tickets.filter(t => t.status === 'active').length} Active Issues
                </div>
                <div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-100">
                  {tickets.filter(t => t.status === 'resolved').length} Resolved
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
