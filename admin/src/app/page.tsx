"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard if logged in, otherwise login
    const token = localStorage.getItem("admin_token");
    if (token) {
      router.push("/dashboard");
    } else {
      router.push("/login");
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center min-height-screen">
      <div className="animate-pulse text-primary-600 font-medium text-lg">
        Initializing LifeWise Admin...
      </div>
    </div>
  );
}
