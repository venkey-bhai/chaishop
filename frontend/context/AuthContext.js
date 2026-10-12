"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { loginUser, getCurrentUser, logoutUser } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize from localStorage on mount
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem("chaiflow_token");
      const savedUser = localStorage.getItem("chaiflow_user");
      if (savedToken) {
        setToken(savedToken);
        if (savedUser) {
          setCurrentUser(JSON.parse(savedUser));
        }
      }
    } catch (e) {
      console.error("Failed to load auth from storage:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (mobileNumber, password) => {
    const res = await loginUser({ mobile_number: mobileNumber, password });
    if (res?.access_token) {
      setToken(res.access_token);
      setCurrentUser(res.user);
      localStorage.setItem("chaiflow_token", res.access_token);
      localStorage.setItem("chaiflow_user", JSON.stringify(res.user));
    }
    return res;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch (e) {
      // ignore network errors on logout
    }
    setToken("");
    setCurrentUser(null);
    localStorage.removeItem("chaiflow_token");
    localStorage.removeItem("chaiflow_user");
  }, []);

  const getValidAdminToken = useCallback(async () => {
    if (token && currentUser?.role === "ADMIN") {
      return token;
    }
    // Auto-login as default admin if not logged in
    try {
      const res = await loginUser({ mobile_number: "9999999999", password: "admin123" });
      if (res?.access_token) {
        setToken(res.access_token);
        setCurrentUser(res.user);
        localStorage.setItem("chaiflow_token", res.access_token);
        localStorage.setItem("chaiflow_user", JSON.stringify(res.user));
        return res.access_token;
      }
    } catch (err) {
      console.error("Failed to obtain admin token:", err);
      throw err;
    }
    return token;
  }, [token, currentUser]);

  return (
    <AuthContext.Provider
      value={{
        token,
        currentUser,
        loading,
        isAdmin: currentUser?.role === "ADMIN",
        login,
        logout,
        getValidAdminToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
