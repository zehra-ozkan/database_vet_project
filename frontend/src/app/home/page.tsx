"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const [userName, setUserName] = useState("");
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in by looking for 'user' in localStorage
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserName(user.name || "User");
      } catch (e) {
        // If JSON parsing fails, redirect back to login
        router.push("/login");
      }
    } else {
      // Not logged in, redirect to login
      router.push("/login");
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  // We can show a simple loading state until the client-side checks finish
  if (!userName) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-pulse flex space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <div className="w-3 h-3 bg-blue-500 rounded-full animation-delay-200"></div>
          <div className="w-3 h-3 bg-blue-500 rounded-full animation-delay-400"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-8 font-sans transition-colors duration-300">
      <div className="max-w-5xl mx-auto">

        {/* Header Section */}
        <header className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 sm:p-8 border border-gray-100 dark:border-gray-700 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                Hello, {userName}! 👋
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                Welcome back to your VetChain Dashboard.
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 rounded-lg font-semibold transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-blue-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow group cursor-pointer">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <span className="text-xl">📅</span>
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-2">Appointments</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">View and manage your upcoming schedule.</p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-emerald-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow group cursor-pointer">
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <span className="text-xl">🐾</span>
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-2">Patients</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Access medical records and history.</p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-purple-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow group cursor-pointer">
            <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <span className="text-xl">📦</span>
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-2">Inventory</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Check stock and order supplies.</p>
          </div>
        </div>

      </div>
    </div>
  );
}
