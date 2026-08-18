import axios from "axios";
import { API_URL } from "./config";

export interface LoyaltyHistoryRow {
  id: string;
  delta: number;
  reason: string;
  ref_id?: string | null;
  created_at: string;
}

export interface LoyaltyMe {
  balance: number;
  referral_code: string;
  history: LoyaltyHistoryRow[];
}

function authHeaders() {
  const t = localStorage.getItem("authToken");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function getLoyaltyMe(): Promise<LoyaltyMe> {
  const r = await axios.get<LoyaltyMe>(`${API_URL}/loyalty/me`, {
    headers: authHeaders(),
  });
  return r.data;
}

export async function applyReferral(code: string): Promise<{ ok: boolean }> {
  const r = await axios.post<{ ok: boolean }>(
    `${API_URL}/loyalty/redeem`,
    { code },
    { headers: authHeaders() }
  );
  return r.data;
}
