import React, { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { singupBusiness } from '../api/singup';
import { BusinessRegistration } from '../types';

interface FormErrors {
  companyName?: string;
  email?: string;
  phone?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  description?: string;
  categories?: string;
  shippingPolicy?: string;
  returnPolicy?: string;
  legalDocuments?: string;
  password?: string;
  confirmPassword?: string;
}

const productCategories = [
  'Technology', 'Clothing', 'Accessories', 'Home & Garden', 'Beauty & Health',
  'Sports & Outdoors', 'Toys & Games', 'Books & Media', 'Food & Beverages', 'Automotive', 'Art & Crafts'
];

export function BusinessRegistrationPage() {
  const [formData, setFormData] = useState<BusinessRegistration & { password: string; confirmPassword: string }>({
    companyName: '',
    email: '',
    phone: '',
    address: { street: '', postalCode: '', city: '', country: '' },
    description: '',
    categories: [],
    shippingPolicy: '',
    returnPolicy: '',
    legalDocuments: { nif: '', cif: '' },
    password: '',
    confirmPassword: ''
  });
  
  const [errors, setErrors] = useState<FormErrors>({});
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string; } | null>(null);

  const navigate = useNavigate();

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.companyName) newErrors.companyName = 'Company name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(formData.email)) newErrors.email = 'Invalid email address';
    if (!formData.phone) newErrors.phone = 'Phone number is required';
    if (!formData.address.street) newErrors.street = 'Street address is required';
    if (!formData.address.postalCode) newErrors.postalCode = 'Postal code is required';
    if (!formData.address.city) newErrors.city = 'City is required';
    if (!formData.address.country) newErrors.country = 'Country is required';
    if (!formData.description) newErrors.description = 'Company description is required';
    if (formData.categories.length === 0) newErrors.categories = 'Select at least one product category';
    if (!formData.shippingPolicy) newErrors.shippingPolicy = 'Shipping policy is required';
    if (!formData.returnPolicy) newErrors.returnPolicy = 'Return policy is required';
    if (!formData.legalDocuments.nif && !formData.legalDocuments.cif) newErrors.legalDocuments = 'At least one legal document ID is required';
    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      await singupBusiness(
        formData.email,
        formData.password,
        formData.companyName,
        formData.legalDocuments.cif || formData.legalDocuments.nif || ''
      );
      setNotification({ type: 'success', message: 'Business registration successful! Redirecting to login...' });
      setTimeout(() => navigate('/login'), 1500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Registration failed. Please try again.';
      setNotification({ type: 'error', message: msg });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData((prev) => ({
        ...prev,
        [parent]: { 
          ...prev[parent as keyof typeof prev] as Record<string, unknown>, 
          [child]: value 
        }
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

interface CategoryChangeEvent extends React.ChangeEvent<HTMLInputElement> {
    target: HTMLInputElement & { value: string; checked: boolean };
}

const handleCategoryChange = (e: CategoryChangeEvent) => {
    const category = e.target.value;
    const checked = e.target.checked;

    if (checked) {
        setFormData({
            ...formData,
            categories: [...formData.categories, category],
        });
    } else {
        setFormData({
            ...formData,
            categories: formData.categories.filter((c: string) => c !== category),
        });
    }
};


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl w-full space-y-8">
        {notification && (
          <div className={`p-4 rounded-md ${notification.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {notification.message}
          </div>
        )}
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">Business Registration</h2>
          <div className="flex items-center justify-center mt-2">
            <Building2 className="w-8 h-8 text-brand-500" />
            <p className="ml-2 text-lg font-medium text-gray-700 dark:text-gray-300">Register your business</p>
          </div>
        </div>
        <form className="space-y-6 mt-8" onSubmit={handleSubmit}>
          {/* Información básica de la empresa */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Business Information</h3>
            
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Company Name</label>
                <input 
                  id="companyName"
                  name="companyName" 
                  type="text" 
                  required
                  placeholder="Your company name" 
                  value={formData.companyName} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
                {errors.companyName && <p className="text-red-600 text-sm mt-1">{errors.companyName}</p>}
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label>
                <input 
                  id="email"
                  name="email" 
                  type="email" 
                  required
                  placeholder="business@example.com" 
                  value={formData.email} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
                {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label>
                <input 
                  id="phone"
                  name="phone" 
                  type="tel" 
                  required
                  placeholder="Business phone number" 
                  value={formData.phone} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
                {errors.phone && <p className="text-red-600 text-sm mt-1">{errors.phone}</p>}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Description</label>
                <textarea 
                  id="description"
                  name="description" 
                  required
                  rows={3}
                  placeholder="Brief description of your business" 
                  value={formData.description} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
                {errors.description && <p className="text-red-600 text-sm mt-1">{errors.description}</p>}
              </div>
            </div>
          </div>

          {/* Dirección de la empresa */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Business Address</h3>
            
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="address.street" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Street Address</label>
                <input 
                  id="address.street"
                  name="address.street" 
                  type="text" 
                  required
                  placeholder="Street address" 
                  value={formData.address.street} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
                {errors.street && <p className="text-red-600 text-sm mt-1">{errors.street}</p>}
              </div>

              <div>
                <label htmlFor="address.postalCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Postal Code</label>
                <input 
                  id="address.postalCode"
                  name="address.postalCode" 
                  type="text" 
                  required
                  placeholder="Postal code" 
                  value={formData.address.postalCode} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
                {errors.postalCode && <p className="text-red-600 text-sm mt-1">{errors.postalCode}</p>}
              </div>

              <div>
                <label htmlFor="address.city" className="block text-sm font-medium text-gray-700 dark:text-gray-300">City</label>
                <input 
                  id="address.city"
                  name="address.city" 
                  type="text" 
                  required
                  placeholder="City" 
                  value={formData.address.city} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
                {errors.city && <p className="text-red-600 text-sm mt-1">{errors.city}</p>}
              </div>

              <div>
                <label htmlFor="address.country" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Country</label>
                <input 
                  id="address.country"
                  name="address.country" 
                  type="text" 
                  required
                  placeholder="Country" 
                  value={formData.address.country} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
                {errors.country && <p className="text-red-600 text-sm mt-1">{errors.country}</p>}
              </div>
            </div>
          </div>

          {/* Categorías de productos y políticas */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Product Categories & Policies</h3>
            
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
                <label htmlFor="categories" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Product Categories</label>
                <div className="mt-1">
                    {productCategories.map(category => (
                    <div key={category} className="flex items-center mb-2">
                        <input
                        id={`category-${category}`}
                        type="checkbox"
                        name="categories"
                        value={category}
                        checked={formData.categories.includes(category)}
                        onChange={handleCategoryChange}
                        className="w-5 h-5 appearance-none cursor-pointer border border-gray-300 dark:border-gray-600 rounded-md mr-2 checked:bg-no-repeat checked:bg-center checked:border-indigo-500 checked:bg-indigo-100"
                        />
                        <label htmlFor={`category-${category}`} className="text-sm font-normal text-gray-600 dark:text-gray-400 ml-2">{category}</label>
                    </div>
                    ))}
                </div>
                {errors.categories && <p className="text-red-600 text-sm mt-1">{errors.categories}</p>}
                </div>


              <div className="sm:col-span-2">
                <label htmlFor="shippingPolicy" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Shipping Policy</label>
                <textarea 
                  id="shippingPolicy"
                  name="shippingPolicy" 
                  required
                  rows={3}
                  placeholder="Describe your shipping policy" 
                  value={formData.shippingPolicy} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
                {errors.shippingPolicy && <p className="text-red-600 text-sm mt-1">{errors.shippingPolicy}</p>}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="returnPolicy" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Return Policy</label>
                <textarea 
                  id="returnPolicy"
                  name="returnPolicy" 
                  required
                  rows={3}
                  placeholder="Describe your return policy" 
                  value={formData.returnPolicy} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
                {errors.returnPolicy && <p className="text-red-600 text-sm mt-1">{errors.returnPolicy}</p>}
              </div>
            </div>
          </div>

          {/* Documentación legal */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Legal Documents</h3>
            
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
              <div>
                <label htmlFor="legalDocuments.nif" className="block text-sm font-medium text-gray-700 dark:text-gray-300">NIF</label>
                <input 
                  id="legalDocuments.nif"
                  name="legalDocuments.nif" 
                  type="text" 
                  placeholder="NIF number (if applicable)" 
                  value={formData.legalDocuments.nif} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
              </div>

              <div>
                <label htmlFor="legalDocuments.cif" className="block text-sm font-medium text-gray-700 dark:text-gray-300">CIF</label>
                <input 
                  id="legalDocuments.cif"
                  name="legalDocuments.cif" 
                  type="text" 
                  placeholder="CIF number (if applicable)" 
                  value={formData.legalDocuments.cif} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
              </div>
              {errors.legalDocuments && <p className="text-red-600 text-sm mt-1 col-span-2">{errors.legalDocuments}</p>}
            </div>
          </div>

          {/* Contraseña */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Account Security</h3>
            
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                <input 
                  id="password"
                  name="password" 
                  type="password" 
                  required
                  placeholder="Password" 
                  value={formData.password} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
                {errors.password && <p className="text-red-600 text-sm mt-1">{errors.password}</p>}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm Password</label>
                <input 
                  id="confirmPassword"
                  name="confirmPassword" 
                  type="password" 
                  required
                  placeholder="Confirm Password" 
                  value={formData.confirmPassword} 
                  onChange={handleInputChange} 
                  className="w-full px-3 py-2 border rounded-md mt-1" 
                />
                {errors.confirmPassword && <p className="text-red-600 text-sm mt-1">{errors.confirmPassword}</p>}
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button 
              type="submit" 
              className="w-full py-3 px-4 text-white bg-brand-500 hover:bg-brand-600 rounded-lg font-semibold shadow-lg shadow-brand-500/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500"
            >
              Register Business
            </button>
          </div>
          
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            <p>Already have an account? <a href="/login" className="font-semibold text-brand-500 hover:text-brand-700">Sign in</a></p>
            <p className="mt-1">Need a personal account? <a href="/user-registration" className="font-semibold text-brand-500 hover:text-brand-700">Register as a user</a></p>
          </div>
        </form>
      </div>
    </div>
  );
}
