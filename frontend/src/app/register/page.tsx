"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("http://localhost:5000/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password, phoneNumber, role }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to register");
      }

      // Registration successful, save user to localStorage
      localStorage.setItem("user", JSON.stringify(data.user));
      
      // Redirect to home dashboard
      router.push("/home");
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors duration-300">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden p-8 border border-gray-100 dark:border-gray-700 transition-colors duration-300 my-8">
        
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl mb-4 flex items-center justify-center shadow-lg shadow-emerald-500/30 transform transition-transform hover:scale-105">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">VetChain</h2>
            <p className="text-sm font-semibold text-teal-500 dark:text-teal-400 mt-1 uppercase tracking-wider">Clinic Network</p>
          </div>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Create an account</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Register with your role to get started</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 animate-pulse">
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Full Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              placeholder="Alex Johnson"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all shadow-sm outline-none"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all shadow-sm outline-none"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="phoneNumber" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Phone Number
            </label>
            <input
              type="tel"
              id="phoneNumber"
              name="phoneNumber"
              placeholder="+1 (555) 000-0000"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all shadow-sm outline-none"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all shadow-sm outline-none"
            />
          </div>

          <div className="space-y-2 pb-2">
            <label htmlFor="role" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Role
            </label>
            <select
              id="role"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all shadow-sm outline-none appearance-none cursor-pointer"
            >
              <option value="" disabled>Select your role</option>
              <option value="owner">Pet Owner</option>
              <option value="vet">Veterinarian</option>
              <option value="manager">Manager / Admin</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg hover:shadow-teal-500/30 focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-70 disabled:cursor-not-allowed transition-all transform active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Registering...
              </span>
            ) : "Register"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-teal-600 hover:text-teal-500 dark:text-teal-400 dark:hover:text-teal-300 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
