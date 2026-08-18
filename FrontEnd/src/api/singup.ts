import axios, { AxiosError } from 'axios';
import { API_URL } from './config';

interface SingupResponse {
  id: string;
  email: string;
}

interface ApiError {
  message?: string;
}

export const singup = async (email: string, password: string): Promise<SingupResponse> => {
  try {
    const response = await axios.post<SingupResponse>(`${API_URL}/signup`, { email, password });
    return response.data;
  } catch (error) {
    const err = error as AxiosError<ApiError>;
    throw new Error(err.response?.data?.message || 'Registration error');
  }
};

export const singupBusiness = async (
  email: string,
  password: string,
  companyName: string,
  companyID: string
): Promise<SingupResponse> => {
  try {
    const response = await axios.post<SingupResponse>(`${API_URL}/signupBusiness`, {
      email,
      password,
      company_name: companyName,
      company_id: companyID,
    });
    return response.data;
  } catch (error) {
    const err = error as AxiosError<ApiError>;
    throw new Error(err.response?.data?.message || 'Business registration error');
  }
};
