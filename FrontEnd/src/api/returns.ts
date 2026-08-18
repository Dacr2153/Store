import axios from "axios";
import { API_URL } from "./config";

export interface ReturnRow {
  id: string;
  order_id: string;
  user_id: string;
  reason: string;
  status: "requested" | "approved" | "rejected" | "completed";
  refund_amount: number;
  created_at: string;
}

function authHeaders() {
  const t = localStorage.getItem("authToken");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function listMyReturns(): Promise<ReturnRow[]> {
  const r = await axios.get<ReturnRow[]>(`${API_URL}/returns`, {
    headers: authHeaders(),
  });
  return Array.isArray(r.data) ? r.data : [];
}

export async function createReturn(
  orderId: string,
  reason: string
): Promise<ReturnRow> {
  const r = await axios.post<ReturnRow>(
    `${API_URL}/returns`,
    { order_id: orderId, reason },
    { headers: authHeaders() }
  );
  return r.data;
}
