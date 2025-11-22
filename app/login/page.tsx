import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-xl mb-4 shadow-lg">
            <span className="text-2xl font-bold text-white">EFA</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Invoice Panel
          </h1>
          <p className="text-gray-400">
            Ozon siparişleri için fatura yönetim sistemi
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
          <h2 className="text-2xl font-semibold text-white mb-6 text-center">
            Giriş Yap
          </h2>
          <LoginForm />
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-400 mt-6">
          © 2025 Invoice Panel. Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  );
}

