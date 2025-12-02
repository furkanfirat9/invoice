import LoginForm from "@/components/LoginForm";
import Image from "next/image";

export default function LoginPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/login.jpg"
          alt="Login Background"
          fill
          className="object-cover object-center"
          priority
        />
        {/* Dark Overlay with Blur */}
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]" />
        {/* Gradient Overlay for Depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-slate-900/30" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo/Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600/90 backdrop-blur-sm rounded-xl mb-4 shadow-lg ring-1 ring-white/20">
            <span className="text-2xl font-bold text-white">EFA</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-md">
            Invoice Panel
          </h1>
        </div>

        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-8 relative overflow-hidden group">
          {/* Subtle shine effect on hover */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

          <h2 className="text-2xl font-semibold text-white mb-6 text-center">
            Giriş Yap
          </h2>
          <LoginForm />
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-400 mt-6 drop-shadow-sm">
          © 2025 Invoice Panel. Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  );
}

