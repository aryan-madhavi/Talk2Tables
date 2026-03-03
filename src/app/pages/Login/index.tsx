import React from 'react';
import { useNavigate } from 'react-router';
import { MessageSquare } from 'lucide-react';
import { LoginForm }  from './components/LoginForm';
import { SSOButtons } from './components/SSOButtons';

export default function Login() {
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: wire to auth API
    navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg overflow-hidden">

        <div className="p-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-700 rounded-2xl flex items-center justify-center shadow-md">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Heading */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Talk2Tables</h1>
            <p className="text-gray-600">Ask your database in plain language</p>
          </div>

          <LoginForm onSubmit={handleLogin} />
          <SSOButtons />
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-sm">
          <a href="#" className="text-blue-700 hover:text-blue-800 font-medium">Forgot password?</a>
          <span className="text-gray-500">v1.0.4</span>
        </div>

      </div>
    </div>
  );
}