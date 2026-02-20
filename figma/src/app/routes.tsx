import React from 'react';
import { createBrowserRouter } from "react-router";
import { AppLayout } from "./components/layout/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import QueryInterface from "./pages/QueryInterface";
import History from "./pages/History";
import SchemaBrowser from "./pages/SchemaBrowser";
import AdminPanel from "./pages/AdminPanel";
import Settings from "./pages/Settings";

const NotFound = () => <div className="p-8 text-center text-gray-500">Page Not Found</div>;

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "query", element: <QueryInterface /> },
      { path: "history", element: <History /> },
      { path: "schema", element: <SchemaBrowser /> },
      { path: "admin", element: <AdminPanel /> },
      { path: "settings", element: <Settings /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
