"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, ClipboardList, Eye, EyeOff, Shield, Zap } from "lucide-react";

import { isAuthenticated, login } from "@/lib/auth";

const SLIDES = [
  {
    image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80&auto=format",
    title: "Intelligent Asset Tracking",
    subtitle: "Monitor thousands of devices across multiple sites in real-time with AI-powered insights.",
  },
  {
    image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&q=80&auto=format",
    title: "Enterprise Infrastructure",
    subtitle: "Manage your entire infrastructure lifecycle from deployment to decommission.",
  },
  {
    image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200&q=80&auto=format",
    title: "Team Collaboration",
    subtitle: "Empower field teams with real-time ticketing, maintenance schedules, and inventory access.",
  },
  {
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80&auto=format",
    title: "Financial Clarity",
    subtitle: "Complete visibility into procurement, invoicing, and financial performance across operations.",
  },
];

const STATS = [
  { value: "99.9%", label: "Uptime SLA" },
  { value: "50K+", label: "Devices Managed" },
  { value: "120+", label: "Enterprise Clients" },
];

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isAuthenticated()) router.replace("/");
  }, [router]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
    }, 5000);
  }, []);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startTimer]);

  function goToSlide(index: number) {
    setCurrentSlide(index);
    startTimer();
  }

  function prevSlide() {
    goToSlide((currentSlide - 1 + SLIDES.length) % SLIDES.length);
  }

  function nextSlide() {
    goToSlide((currentSlide + 1) % SLIDES.length);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    try {
      await login(username, password);
      router.push("/");
    } catch (err: unknown) {
      let msg: string | undefined;
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as { response?: { data?: { detail?: string } } };
        msg = axiosErr.response?.data?.detail;
      }
      setError(msg || "Unable to sign in. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left — Image Carousel */}
      <div className="relative hidden w-[55%] overflow-hidden lg:block">
        {/* Gradient overlay */}
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-teal-900/70 via-teal-900/50 to-teal-950/80" />

        {/* Slide images */}
        {SLIDES.map((slide, i) => (
          <div
            key={i}
            className="absolute inset-0 transition-all duration-700 ease-in-out"
            style={{ opacity: currentSlide === i ? 1 : 0, transform: currentSlide === i ? "scale(1)" : "scale(1.05)" }}
          >
            <img src={slide.image} alt="" className="h-full w-full object-cover" />
          </div>
        ))}

        {/* Content overlay */}
        <div className="relative z-20 flex h-full flex-col justify-between p-10">
          {/* Top — Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm border border-white/20">
              <ClipboardList className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">DIGIX</h1>
              <p className="text-[11px] text-teal-200/80">Asset Management Platform</p>
            </div>
          </div>

          {/* Middle — Slide text */}
          <div className="max-w-lg space-y-4">
            {SLIDES.map((slide, i) => (
              <div
                key={i}
                className="transition-all duration-500"
                style={{
                  opacity: currentSlide === i ? 1 : 0,
                  transform: currentSlide === i ? "translateY(0)" : "translateY(20px)",
                  position: currentSlide === i ? "relative" : "absolute",
                  pointerEvents: currentSlide === i ? "auto" : "none",
                }}
              >
                <h2 className="text-3xl font-bold text-white leading-tight">{slide.title}</h2>
                <p className="mt-3 text-base text-teal-100/80 leading-relaxed">{slide.subtitle}</p>
              </div>
            ))}

            {/* Slide indicators + nav */}
            <div className="flex items-center gap-4 pt-4">
              <div className="flex gap-2">
                {SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goToSlide(i)}
                    className="group relative h-1.5 overflow-hidden rounded-full transition-all duration-300"
                    style={{ width: currentSlide === i ? 32 : 12 }}
                  >
                    <div className="absolute inset-0 rounded-full bg-white/25" />
                    {currentSlide === i && (
                      <div className="absolute inset-0 rounded-full bg-white animate-slideProgress" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 ml-2">
                <button onClick={prevSlide} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white border border-white/10">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={nextSlide} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white border border-white/10">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom — Stats bar */}
          <div className="flex items-center gap-8 rounded-2xl border border-white/10 bg-white/5 px-8 py-5 backdrop-blur-md">
            {STATS.map((stat, i) => (
              <div key={i} className={`${i > 0 ? "border-l border-white/10 pl-8" : ""}`}>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-teal-200/70">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — Login Form */}
      <div className="flex flex-1 flex-col">
        {/* Mobile logo */}
        <div className="flex items-center gap-3 p-6 lg:hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600">
            <ClipboardList className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">DIGIX</span>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-12 lg:px-16">
          <div className="w-full max-w-[420px]">
            {/* Header */}
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">Welcome back</h2>
              <p className="text-sm text-gray-500">
                Sign in to your DIGIX account to continue
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              {error && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 animate-in slide-in-from-top-2">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100">
                    <span className="text-xs font-bold">!</span>
                  </div>
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  autoComplete="username"
                  className="flex h-12 w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                  placeholder="Enter your username"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    className="flex h-12 w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 pr-12 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-xl hover:shadow-teal-500/30 disabled:pointer-events-none disabled:opacity-50"
              >
                {loading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              </button>
            </form>

            {/* Trust badges */}
            <div className="mt-10 flex items-center gap-6 border-t border-gray-100 pt-8">
              <div className="flex items-center gap-2 text-gray-400">
                <Shield className="h-4 w-4 text-teal-500/60" />
                <span className="text-xs">256-bit encryption</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Zap className="h-4 w-4 text-teal-500/60" />
                <span className="text-xs">SSO ready</span>
              </div>
            </div>

            {/* Footer */}
            <p className="mt-8 text-center text-[11px] text-gray-400">
              &copy; {new Date().getFullYear()} DIGIX Asset Operations. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
