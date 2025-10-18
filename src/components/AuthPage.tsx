import { useState } from 'react';
import { Database, Eye, EyeOff, Terminal, Code2, Cpu, Server } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';

interface AuthPageProps {
  onAuthenticated: (username: string) => void;
}

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (isLogin) {
      if (!username || !password) {
        setError('Please fill in all fields');
        return;
      }
      // In a real app, you would validate credentials here
      onAuthenticated(username);
    } else {
      if (!username || !email || !password || !confirmPassword) {
        setError('Please fill in all fields');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      // In a real app, you would create the account here
      onAuthenticated(username);
    }
  };

  return (
    <div className="min-h-screen flex bg-background relative overflow-hidden">
      {/* Left side - Branding and features */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-violet-950 to-indigo-950 relative overflow-hidden p-12 flex-col justify-between">
        {/* Animated grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:44px_44px]" />
        
        {/* Floating elements */}
        <div className="absolute top-20 left-20 w-32 h-32 bg-violet-500/10 rounded-lg blur-xl animate-pulse" />
        <div className="absolute bottom-40 right-20 w-40 h-40 bg-indigo-500/10 rounded-lg blur-xl animate-pulse delay-700" />
        <div className="absolute top-1/2 left-1/3 w-24 h-24 bg-purple-500/10 rounded-lg blur-xl animate-pulse delay-1000" />

        <div className="relative z-10">
          {/* Logo and title */}
          <div className="flex items-center gap-4 mb-12">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-violet-500/50">
              <Terminal className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-white text-3xl">Talk2Tables</h1>
              <p className="text-violet-300">Natural Language Query Processor</p>
            </div>
          </div>

          {/* Code-like terminal display */}
          <div className="bg-black/40 backdrop-blur-md rounded-lg p-6 border border-violet-500/30 shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="ml-2 text-violet-400">query-console.sql</span>
            </div>
            <div className="font-mono space-y-2">
              <p className="text-emerald-400">
                <span className="text-violet-400">SELECT</span> * <span className="text-violet-400">FROM</span> users
              </p>
              <p className="text-emerald-400">
                <span className="text-violet-400">WHERE</span> role = <span className="text-amber-400">'analyst'</span>
              </p>
              <p className="text-emerald-400">
                <span className="text-violet-400">ORDER BY</span> last_login <span className="text-violet-400">DESC</span>;
              </p>
              <p className="text-gray-500">-- Query executed successfully ✓</p>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="relative z-10 grid grid-cols-2 gap-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-600/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Database className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h3 className="text-white mb-1">Multi-Database</h3>
              <p className="text-violet-300/70">Connect to multiple databases seamlessly</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Code2 className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-white mb-1">Natural Language</h3>
              <p className="text-violet-300/70">Query databases using plain English</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Cpu className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-white mb-1">AI-Powered</h3>
              <p className="text-violet-300/70">Intelligent query optimization</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-pink-600/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Server className="h-5 w-5 text-pink-400" />
            </div>
            <div>
              <h3 className="text-white mb-1">Real-time Results</h3>
              <p className="text-violet-300/70">Instant query execution and results</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Terminal className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-foreground">Talk2Tables</h1>
              <p className="text-muted-foreground">Query Processor</p>
            </div>
          </div>

          <Card className="p-8 border-border/50 shadow-lg">
            {/* Title */}
            <div className="mb-6">
              <h2 className="text-foreground mb-2">
                {isLogin ? 'Access Query Console' : 'Create Account'}
              </h2>
              <p className="text-muted-foreground">
                {isLogin 
                  ? 'Sign in to start querying your databases' 
                  : 'Register to access the query processor'}
              </p>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-1 mb-6 p-1 bg-muted/50 rounded-lg border border-border/50">
              <button
                onClick={() => {
                  setIsLogin(true);
                  setError('');
                }}
                className={`flex-1 py-2.5 px-4 rounded-md transition-all ${
                  isLogin
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setIsLogin(false);
                  setError('');
                }}
                className={`flex-1 py-2.5 px-4 rounded-md transition-all ${
                  !isLogin
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Register
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-background border-border/50 focus:border-violet-500 transition-colors"
                />
              </div>

              {/* Email (Sign Up only) */}
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-background border-border/50 focus:border-violet-500 transition-colors"
                  />
                </div>
              )}

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-background border-border/50 focus:border-violet-500 pr-10 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password (Sign Up only) */}
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="bg-background border-border/50 focus:border-violet-500 pr-10 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-destructive text-center">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all"
              >
                <Terminal className="h-4 w-4 mr-2" />
                {isLogin ? 'Access Console' : 'Create Account'}
              </Button>
            </form>

            {/* Forgot password / Switch */}
            {isLogin && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  className="text-violet-600 hover:text-violet-700 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Footer */}
            <div className="mt-6 pt-6 border-t border-border/50 text-center">
              <p className="text-muted-foreground">
                {isLogin ? "Don't have access? " : 'Already registered? '}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError('');
                  }}
                  className="text-violet-600 hover:text-violet-700 transition-colors"
                >
                  {isLogin ? 'Request access' : 'Sign in'}
                </button>
              </p>
            </div>
          </Card>

          {/* Additional info */}
          <div className="mt-6 text-center text-muted-foreground">
            <p>Secure database query processor • Enterprise-grade encryption</p>
          </div>
        </div>
      </div>
    </div>
  );
}