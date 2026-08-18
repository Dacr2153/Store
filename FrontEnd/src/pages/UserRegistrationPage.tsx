import React, { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { User as UserIcon, Mail, Lock, Phone } from 'lucide-react';
import { singup } from "../api/singup"; // Fixed: removed .js extension and using the TypeScript file
import { motion } from 'framer-motion';

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
}

export function UserRegistrationPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string; } | null>(null);

  const navigate = useNavigate();

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.firstName) newErrors.firstName = 'First name is required';
    if (!formData.lastName) newErrors.lastName = 'Last name is required';
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(formData.email)) {
      newErrors.email = 'Invalid email address';
    }
    if (formData.phone && !/^\d{10}$/.test(formData.phone)) {
      newErrors.phone = 'Phone number must be 10 digits';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      await singup(formData.email, formData.password);
      setNotification({ type: 'success', message: 'Registration successful! Redirecting to login...' });
      setTimeout(() => navigate('/login'), 1500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Registration failed. Please try again.';
      setNotification({ type: 'error', message: msg });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-950 via-brand-800 to-brand-500 p-6">
      <motion.div className="max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-card border border-gray-100 dark:border-gray-700" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto shadow-lg">
            <UserIcon className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 mt-3">Create your account</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Join us and start shopping in seconds.</p>
        </div>

        {notification && (
          <motion.div className={`mt-4 p-3 rounded-md text-center ${notification.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {notification.message}
          </motion.div>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {[
            { label: 'First Name', name: 'firstName', icon: <UserIcon /> },
            { label: 'Last Name', name: 'lastName', icon: <UserIcon /> },
            { label: 'Email', name: 'email', icon: <Mail /> },
            { label: 'Phone (optional)', name: 'phone', icon: <Phone />, required: false },
            { label: 'Password', name: 'password', icon: <Lock />, type: 'password' },
            { label: 'Confirm Password', name: 'confirmPassword', icon: <Lock />, type: 'password' }
          ].map(({ label, name, icon, type = 'text', required = true }) => (
            <div key={name} className="relative">
              <span className="absolute left-3 top-3 text-gray-500 dark:text-gray-400">{icon}</span>
              <input
                id={name}
                name={name}
                type={type}
                placeholder={label}
                value={formData[name as keyof typeof formData]}
                onChange={handleInputChange}
                required={required}
                className="w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
              {errors[name as keyof FormErrors] && <p className="text-red-600 text-sm mt-1">{errors[name as keyof FormErrors]}</p>}
            </div>
          ))}

          <motion.button type="submit" className="w-full bg-brand-500 hover:bg-brand-600 text-white py-2.5 rounded-lg font-semibold shadow-lg shadow-brand-500/20 transition" whileTap={{ scale: 0.95 }}>
            Create account
          </motion.button>
          <div className="text-center text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <p>Already have an account? <a href="/login" className="font-semibold text-brand-500 hover:text-brand-700">Sign in</a></p>
            <p>Are you a business? <a href="/business-registration" className="font-semibold text-accent-600 hover:text-accent-500">Become a vendor</a></p>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
