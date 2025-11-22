import { LoginFormData, LoginFormErrors } from "@/types/auth";

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateLoginForm = (
  data: LoginFormData
): LoginFormErrors => {
  const errors: LoginFormErrors = {};

  if (!data.email.trim()) {
    errors.email = "E-posta adresi veya kullanıcı adı gereklidir";
  }

  if (!data.password.trim()) {
    errors.password = "Şifre gereklidir";
  }

  return errors;
};

