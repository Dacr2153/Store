import axios, { AxiosError } from 'axios';
import { API_URL } from './config';

interface LoginResponse {
  token: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

interface ApiError {
  message?: string;
}

export interface UserData {
  id: string;
  email: string;
  name?: string;
  phone?: string;
}

export const login = async (email: string, password: string): Promise<string> => {
  try {
    const response = await axios.post<LoginResponse>(`${API_URL}/login`, { email, password });
    const data = response.data;
    const token = data.access_token || data.token;
    localStorage.setItem('authToken', token);
    if (data.refresh_token) {
      localStorage.setItem('refreshToken', data.refresh_token);
    }
    return token;
  } catch (error) {
    const err = error as AxiosError<ApiError>;
    throw new Error(err.response?.data?.message || 'Authentication error');
  }
};

export const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;
  try {
    const response = await axios.post<LoginResponse>(`${API_URL}/auth/refresh`, {
      refresh_token: refreshToken,
    });
    const data = response.data;
    const token = data.access_token || data.token;
    localStorage.setItem('authToken', token);
    if (data.refresh_token) {
      localStorage.setItem('refreshToken', data.refresh_token);
    }
    return token;
  } catch {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    return null;
  }
};

export const getUserInfo = async (token: string): Promise<UserData> => {
  try {
    const response = await axios.get<UserData>(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    const err = error as AxiosError<ApiError>;
    throw new Error(err.response?.data?.message || 'Error fetching user info');
  }
};

export const updateUserProfile = async (
  token: string,
  data: { name?: string; phone?: string }
): Promise<UserData> => {
  const response = await axios.put<UserData>(`${API_URL}/me`, data, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  return response.data;
};

export const logout = (): void => {
  localStorage.removeItem('authToken');
};
