"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { UserRole, LoginFormData, LoginFormErrors } from "@/types/auth";
import { validateLoginForm } from "@/lib/validations";

export default function LoginForm() {
  const router = useRouter();
  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
    role: UserRole.SELLER,
  });

  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleRoleChange = (role: UserRole) => {
    setFormData((prev) => ({ ...prev, role }));
    setErrors({});
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name as keyof LoginFormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    const validationErrors = validateLoginForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setIsLoading(false);
      return;
    }

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: formData.email,
        password: formData.password,
      });

      if (result?.error) {
        setErrors({
          general: "E-posta adresi veya şifre hatalı. Lütfen tekrar deneyin.",
        });
        setIsLoading(false);
        return;
      }

      // Başarılı giriş sonrası rol kontrolü ve yönlendirme için kısa bir bekleme
      // Gerçek projelerde bu kontrolü middleware veya session üzerinden yapmak daha doğrudur
      // Ancak burada frontend'de seçilen role göre yönlendirme yapıyoruz
      // Eğer kullanıcı SELLER seçip CARRIER hesabıyla girerse backend'de engellenmese bile
      // Yanlış sayfaya gidebilir, bu yüzden basit bir kontrol yapabiliriz veya
      // Direkt formData.role'a göre yönlendirebiliriz (Session verisi login sonrası hemen güncellenmeyebilir)
      
      if (formData.role === UserRole.CARRIER) {
        router.push("/carrier");
      } else {
        router.push("/dashboard");
      }
      
      // Sayfanın yenilenmesini beklemeden yönlendirme
      router.refresh();
      
    } catch (error) {
      console.error("Login error:", error);
      setErrors({
        general: "Bir hata oluştu. Lütfen daha sonra tekrar deneyin.",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Role Selection Toggle */}
      <div className="mb-8">
        <div className="inline-flex rounded-lg bg-white/10 p-1 w-full border border-white/20">
          <button
            type="button"
            onClick={() => handleRoleChange(UserRole.SELLER)}
            className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
              formData.role === UserRole.SELLER
                ? "bg-blue-600 text-white shadow-md"
                : "text-gray-300 hover:text-white hover:bg-white/5"
            }`}
          >
            Satıcı (Seller)
          </button>
          <button
            type="button"
            onClick={() => handleRoleChange(UserRole.CARRIER)}
            className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
              formData.role === UserRole.CARRIER
                ? "bg-blue-600 text-white shadow-md"
                : "text-gray-300 hover:text-white hover:bg-white/5"
            }`}
          >
            Kargo (Carrier)
          </button>
        </div>
      </div>

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Email Input */}
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-200 mb-2"
          >
            Kullanıcı Adı / E-posta
          </label>
          <input
            id="email"
            name="email"
            type="text"
            autoComplete="username"
            value={formData.email}
            onChange={handleInputChange}
            className={`w-full px-4 py-3 bg-white/10 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
              errors.email
                ? "border-red-500 focus:ring-red-500"
                : "border-white/20 focus:bg-white/15"
            }`}
            placeholder=""
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-400">{errors.email}</p>
          )}
        </div>

        {/* Password Input */}
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-200 mb-2"
          >
            Şifre
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={formData.password}
              onChange={handleInputChange}
              className={`w-full px-4 py-3 bg-white/10 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-12 ${
                errors.password
                  ? "border-red-500 focus:ring-red-500"
                  : "border-white/20 focus:bg-white/15"
              }`}
              placeholder=""
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white focus:outline-none transition-colors"
              aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
            >
              {showPassword ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-sm text-red-400">{errors.password}</p>
          )}
        </div>

        {/* General Error Message */}
        {errors.general && (
          <div className="rounded-lg bg-red-500/20 border border-red-500/50 p-3 backdrop-blur-sm">
            <p className="text-sm text-red-300">{errors.general}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center shadow-lg hover:shadow-xl"
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray="60"
                  strokeDashoffset="20"
                ></circle>
              </svg>
              Giriş yapılıyor...
            </>
          ) : (
            "Giriş Yap"
          )}
        </button>
      </form>
    </div>
  );
}
