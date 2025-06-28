import { supabase } from "../lib/supabase/client";

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    return {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    };
  }
  return {
    "Content-Type": "application/json",
  };
};

const apiService = {
  async post(url, data) {
    const headers = await getAuthHeaders();
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "API request failed");
    }
    return response.json();
  },

  async get(url) {
    const headers = await getAuthHeaders();
    delete headers["Content-Type"];
    const response = await fetch(url, {
      headers,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "API request failed");
    }
    return response.json();
  },
};

export default apiService;