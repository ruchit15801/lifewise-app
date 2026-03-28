"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { 
  LayoutDashboard, 
  Users, 
  MessageSquare, 
  CreditCard, 
  TicketPercent, 
  Settings, 
  LogOut,
  User,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import Image from "next/image";
import logo from "../../logo.png";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Users, label: "Users", href: "/users" },
  { icon: MessageSquare, label: "Support", href: "/support" },
  { icon: CreditCard, label: "Plans", href: "/plans" },
  { icon: TicketPercent, label: "Promo Codes", href: "/promo-codes" },
  { icon: Settings, label: "Settings", href: "/settings" },
  { icon: User, label: "Profile", href: "/profile" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-72 h-screen bg-white border-r border-gray-100 flex flex-col p-8 fixed left-0 top-0 z-50">
      <div className="flex items-center gap-4 mb-12">
        <div className="w-14 h-14 relative flex items-center justify-center group cursor-pointer">
          <div className="absolute inset-0 bg-primary-600/10 blur-2xl rounded-full group-hover:bg-primary-600/20 transition-all duration-500" />
          <div className="w-full h-full bg-white border border-gray-100 rounded-2xl flex items-center justify-center p-2.5 relative z-10 shadow-sm group-hover:shadow-md group-hover:-translate-y-0.5 transition-all">
            <Image 
              src={logo} 
              alt="LifeWise Logo" 
              className="rounded-lg object-contain"
            />
          </div>
        </div>
        <div>
          <h2 className="font-black text-gray-900 tracking-tighter text-xl leading-none">LifeWise</h2>
          <p className="text-[10px] font-black text-primary-600 uppercase tracking-[0.2em] mt-1 opacity-80">Command Hub</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1.5 pt-2">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                "group flex items-center gap-3.5 px-5 py-3.5 rounded-2xl transition-all duration-300 relative overflow-hidden",
                isActive 
                  ? "text-primary-600 bg-primary-50/50" 
                  : "text-gray-400 hover:text-gray-900 hover:bg-gray-50"
              )}>
                {isActive && (
                  <motion.div 
                    layoutId="active-nav-indicator"
                    className="absolute left-0 w-1.5 h-6 bg-primary-600 rounded-r-full"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <item.icon className={cn(
                  "w-5 h-5 transition-all duration-300",
                  isActive ? "text-primary-600 scale-110" : "text-gray-400 group-hover:text-gray-900 group-hover:scale-110"
                )} />
                <span className={cn(
                  "text-sm font-bold tracking-tight transition-colors duration-300",
                  isActive ? "text-primary-600" : "text-gray-400 group-hover:text-gray-900"
                )}>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-8 border-t border-gray-100">
        <button 
          onClick={() => {
            localStorage.removeItem("admin_token");
            window.location.href = "/login";
          }}
          className="flex items-center gap-4 px-5 py-4 w-full rounded-2xl text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-all duration-300 group"
        >
          <div className="w-10 h-10 bg-gray-50 group-hover:bg-rose-100 rounded-xl flex items-center justify-center transition-colors">
            <LogOut className="w-5 h-5 text-gray-400 group-hover:text-rose-600 group-hover:rotate-12 transition-all" />
          </div>
          <span className="font-bold text-sm">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
