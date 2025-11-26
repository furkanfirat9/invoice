export enum UserRole {
  SELLER = "SELLER",
  CARRIER = "CARRIER",
}

export interface LoginFormData {
  email: string;
  password: string;
  role: UserRole;
}

export interface LoginFormErrors {
  email?: string;
  password?: string;
  general?: string;
}




