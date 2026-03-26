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
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import Image from "next/image";

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
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-72 h-screen bg-white border-r border-gray-100 flex flex-col p-6 fixed left-0 top-0 z-50">
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-12 h-12 relative flex items-center justify-center">
          <div className="absolute inset-0 bg-primary-600/10 blur-xl rounded-full" />
          <Image 
            src="/logo.png" 
            alt="LifeWise Logo" 
            width={40} 
            height={40} 
            className="rounded-lg object-contain relative z-10"
          />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 tracking-tight text-lg leading-tight">LifeWise</h2>
          <p className="text-[10px] font-bold text-primary-600 uppercase tracking-widest">Admin Panel</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                "group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative overflow-hidden",
                isActive 
                  ? "text-primary-600 bg-primary-50/50" 
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              )}>
                {isActive && (
                  <motion.div 
                    layoutId="active-tab"
                    className="absolute left-0 w-1 h-6 bg-primary-600 rounded-r-full"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <item.icon className={cn(
                  "w-5 h-5 transition-colors",
                  isActive ? "text-primary-600" : "text-gray-400 group-hover:text-gray-900"
                )} />
                <span className="font-semibold text-sm">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-gray-100 pt-6">
        <button 
          onClick={() => {
            localStorage.removeItem("admin_token");
            window.location.href = "/login";
          }}
          className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all duration-200 group"
        >
          <LogOut className="w-5 h-5 text-gray-400 group-hover:text-red-600" />
          <span className="font-semibold text-sm">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
