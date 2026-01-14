'use client';

import { useState } from 'react';
import { signIn, signUp } from '@/lib/supabase';
import { Loader2, Mail, Lock, User, ArrowRight, Zap } from 'lucide-react';

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        await signUp(email, password, fullName);
        setMessage('Check your email for the confirmation link!');
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-accent/20 via-background to-background p-12 flex-col justify-between">
        <div className="animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-text-primary">Parallel Task</span>
          </div>
        </div>

        <div className="space-y-6 animate-slide-up">
          <h1 className="text-4xl font-bold text-text-primary leading-tight">
            Manage tasks<br />
            <span className="text-accent">in parallel</span>
          </h1>
          <p className="text-text-secondary text-lg max-w-md">
            A modern task management platform designed for teams who move fast.
            Track progress, collaborate seamlessly, and ship faster.
          </p>

          <div className="flex gap-4 pt-4">
            <div className="flex items-center gap-2 text-text-tertiary">
              <div className="w-2 h-2 bg-success rounded-full" />
              <span className="text-sm">Real-time sync</span>
            </div>
            <div className="flex items-center gap-2 text-text-tertiary">
              <div className="w-2 h-2 bg-accent rounded-full" />
              <span className="text-sm">Calendar integration</span>
            </div>
            <div className="flex items-center gap-2 text-text-tertiary">
              <div className="w-2 h-2 bg-warning rounded-full" />
              <span className="text-sm">Team collaboration</span>
            </div>
          </div>
        </div>

        <div className="text-text-tertiary text-sm animate-fade-in animation-delay-300">
          &copy; 2024 Parallel Task. Built for modern teams.
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-scale-in">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-text-primary">Parallel Task</span>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-text-primary mb-2">
                {isSignUp ? 'Create an account' : 'Welcome back'}
              </h2>
              <p className="text-text-secondary">
                {isSignUp
                  ? 'Start managing your tasks today'
                  : 'Sign in to continue to Parallel Task'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div className="animate-slide-down">
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="John Doe"
                      className="input pl-10"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="input pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    minLength={6}
                    className="input pl-10"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm animate-fade-in">
                  {error}
                </div>
              )}

              {message && (
                <div className="p-3 bg-success/10 border border-success/20 rounded-lg text-success text-sm animate-fade-in">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full h-11 mt-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {isSignUp ? 'Create Account' : 'Sign In'}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setMessage(null);
                }}
                className="text-text-secondary hover:text-text-primary transition-colors text-sm"
              >
                {isSignUp ? (
                  <>
                    Already have an account?{' '}
                    <span className="text-accent font-medium">Sign in</span>
                  </>
                ) : (
                  <>
                    Don&apos;t have an account?{' '}
                    <span className="text-accent font-medium">Sign up</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
