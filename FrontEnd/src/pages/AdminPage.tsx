import React, { useState, useEffect } from 'react';
import { Plus, Save, X, Edit, Trash2, ImageIcon, Upload, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../components/common/Button';
import {
  createProduct, listProducts, uploadProductImage, updateProduct, deleteProduct,
  listProductVariants, createProductVariant, deleteProductVariant
} from '../api/products';
import type { Product } from '../types';
import type { Variant, VariantInput } from '../api/products';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../api/config';

// Define a new interface for form data that includes originalData
interface ProductFormData {
  name: string;
  description: string;
  price: string;
  stock: string;
  originalData?: Product;
}

export const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    description: '',
    price: '',
    stock: ''
  });

  // Management panel (images + variants per product)
  const [managingProduct, setManagingProduct] = useState<Product | null>(null);
  const [manageTab, setManageTab] = useState<'images' | 'variants'>('images');
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantForm, setVariantForm] = useState<{
    attrKey: string; attrValue: string; sku: string; stock: string; price: string;
  }>({ attrKey: 'color', attrValue: '', sku: '', stock: '0', price: '' });
  const [addingVariant, setAddingVariant] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('authToken');

    if (!token) {
      navigate('/login'); 
      return;
    }
    fetchProducts();
  }, [navigate]);

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description,
      price: product.price.toString(),
      stock: product.stock?.toString() || '0',
      originalData: product
    });
    setIsModalOpen(true);
  };

  const handleStockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Solo permitir números enteros positivos
    if (value === '' || /^\d+$/.test(value)) {
      setFormData(prev => ({ ...prev, stock: value }));
    }
  };


  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      const data = await listProducts(0);
      
      // Transform the API response to match the expected Product type
      const transformedProducts = Array.isArray(data) ? data.map(product => {
        return {
          ...product,
          id: String(product.id),
          // Transform images if they exist to match ProductImage type
          images: product.images?.map(img => ({
            url: img.src || '',
            alt: img.alt || ''
          })) || []
        } as unknown as Product;
      }) : [];
      
      setProducts(transformedProducts);
    } catch (error: any) {
      if (error?.response?.status === 401) {
        navigate('/login');
      }
      setError('Failed to fetch products');
      console.error('Error fetching products:', error);
      setProducts([]);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedImage(e.target.files[0]);
    }
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string or valid numbers only
    if (value === '' || (!isNaN(parseFloat(value)) && value.match(/^\d*\.?\d*$/))) {
      setFormData(prev => ({ ...prev, price: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
  
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }
  
      if (editingProduct) {
        const updatedFields: Partial<Product> = {};
        
        if (formData.name !== editingProduct.name) {
          updatedFields.name = formData.name;
        }
        if (formData.description !== editingProduct.description) {
          updatedFields.description = formData.description;
        }
        if (parseFloat(formData.price) !== editingProduct.price) {
          updatedFields.price = parseFloat(formData.price);
        }
        if (parseInt(formData.stock) !== editingProduct.stock) {
          updatedFields.stock = parseInt(formData.stock);
        }

        if (Object.keys(updatedFields).length > 0) {
          await updateProduct(editingProduct.id, updatedFields, token);
        }

        if (selectedImage) {
          try {
            await uploadProductImage(editingProduct.id, selectedImage, token);
          } catch (uploadError) {
            console.error('Image upload failed:', uploadError);
            setError('Product updated, but image upload failed');
          }
        }
      } else {
        const productData = {
          name: formData.name,
          description: formData.description,
          price: parseFloat(formData.price) || 0,
          stock: parseInt(formData.stock) || 0
        };

        const newProduct = await createProduct(productData, token);

        if (selectedImage && newProduct.id) {
          try {
            await uploadProductImage(newProduct.id, selectedImage, token);
          } catch (uploadError) {
            console.error('Image upload failed:', uploadError);
            setError('Product created, but image upload failed');
          }
        }
      }
  
      await fetchProducts();
  
      setIsModalOpen(false);
      setFormData({
        name: '',
        description: '',
        price: '',
        stock: ''
      });
      setSelectedImage(null);
      setEditingProduct(null);
    } catch (error: any) {
      if (error?.response?.status === 401) {
        navigate('/login');
        return;
      }
      setError(error.message || 'Failed to save product');
      console.error('Error saving product:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const confirmDeleteProduct = (productId: string) => {
    setProductToDelete(productId);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete) return;

    const token = localStorage.getItem('authToken');
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      await deleteProduct(productToDelete, token);
      await fetchProducts();
      setIsDeleteModalOpen(false);
      setProductToDelete(null);
    } catch (error: any) {
      if (error?.response?.status === 401) {
        navigate('/login');
        return;
      }
      setError('Failed to delete product');
      console.error('Error deleting product:', error);
    }
  };

  const openManage = async (product: Product) => {
    setManagingProduct(product);
    setManageTab('images');
    setAdditionalImages([]);
    setVariantForm({ attrKey: 'color', attrValue: '', sku: '', stock: '0', price: '' });
    setVariantsLoading(true);
    try {
      const v = await listProductVariants(product.id);
      setVariants(v);
    } catch {
      setVariants([]);
    } finally {
      setVariantsLoading(false);
    }
  };

  const handleUploadImages = async () => {
    if (!managingProduct || additionalImages.length === 0) return;
    const token = localStorage.getItem('authToken');
    if (!token) { navigate('/login'); return; }
    setUploadingImages(true);
    try {
      for (const file of additionalImages) {
        await uploadProductImage(managingProduct.id, file, token);
      }
      setAdditionalImages([]);
      await fetchProducts();
    } catch {
      setError('Image upload failed');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleAddVariant = async () => {
    if (!managingProduct) return;
    const token = localStorage.getItem('authToken');
    if (!token) { navigate('/login'); return; }
    if (!variantForm.sku.trim() || !variantForm.attrValue.trim()) {
      setError('SKU and attribute value are required');
      return;
    }
    setAddingVariant(true);
    try {
      const input: VariantInput = {
        sku: variantForm.sku.trim(),
        attributes: { [variantForm.attrKey]: variantForm.attrValue.trim() },
        stock: parseInt(variantForm.stock) || 0,
        price: variantForm.price ? parseFloat(variantForm.price) : undefined,
      };
      await createProductVariant(managingProduct.id, input, token);
      const updated = await listProductVariants(managingProduct.id);
      setVariants(updated);
      setVariantForm({ attrKey: 'color', attrValue: '', sku: '', stock: '0', price: '' });
    } catch {
      setError('Failed to add variant');
    } finally {
      setAddingVariant(false);
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!managingProduct) return;
    const token = localStorage.getItem('authToken');
    if (!token) { navigate('/login'); return; }
    try {
      await deleteProductVariant(managingProduct.id, variantId, token);
      setVariants((prev) => prev.filter((v) => v.id !== variantId));
    } catch {
      setError('Failed to delete variant');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Product Management</h1>
        <Button
          onClick={() => {
            setEditingProduct(null);
            setIsModalOpen(true);
          }}
          icon={<Plus className="w-5 h-5" />}
          className="flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700"
        >
          Add New Product
        </Button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => {
          const imageUrl = product.url ? `${API_URL}${product.url}` : '';
          
          return(
            <div 
              key={product.id} 
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col"
            >
              {/* Image Section */}
              <div className="relative h-48">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <ImageIcon className="w-16 h-16 text-gray-400" />
                  </div>
                )}
                
                {/* Action Buttons Overlay */}
                <div className="absolute top-2 right-2 flex space-x-2">
                  <button 
                    onClick={() => handleEditProduct(product)}
                    className="bg-white dark:bg-gray-800/80 p-1.5 rounded-full shadow hover:bg-white dark:bg-gray-800 transition"
                    title="Edit Product"
                  >
                    <Edit className="w-5 h-5 text-blue-600" />
                  </button>
                  <button 
                    onClick={() => confirmDeleteProduct(String(product.id))}
                    className="bg-white dark:bg-gray-800/80 p-1.5 rounded-full shadow hover:bg-white dark:bg-gray-800 transition"
                    title="Delete Product"
                  >
                    <Trash2 className="w-5 h-5 text-red-600" />
                  </button>
                </div>
              </div>

              {/* Product Details Section */}
              <div className="p-4 flex flex-col flex-grow">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-2 line-clamp-1">
                  {product.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2 flex-grow">
                  {product.description}
                </p>
                <div className="flex justify-between items-center mt-auto">
                  <span className="text-xl font-semibold text-blue-600">
                    ${Number(product.price).toFixed(2)}
                  </span>
                  <button
                    onClick={() => openManage(product)}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900 transition"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Manage
                    {managingProduct?.id === product.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {/* Inline management panel */}
                {managingProduct?.id === product.id && (
                  <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4 space-y-3">
                    {/* Tabs */}
                    <div className="flex gap-2 text-xs font-semibold">
                      <button
                        onClick={() => setManageTab('images')}
                        className={`px-3 py-1.5 rounded-lg transition ${manageTab === 'images' ? 'bg-brand-500 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900'}`}
                      >
                        <Upload className="w-3 h-3 inline mr-1" /> Images
                      </button>
                      <button
                        onClick={() => setManageTab('variants')}
                        className={`px-3 py-1.5 rounded-lg transition ${manageTab === 'variants' ? 'bg-brand-500 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900'}`}
                      >
                        <Layers className="w-3 h-3 inline mr-1" /> Variants {variants.length > 0 && `(${variants.length})`}
                      </button>
                    </div>

                    {/* Images tab */}
                    {manageTab === 'images' && (
                      <div className="space-y-2">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => setAdditionalImages(Array.from(e.target.files || []))}
                          className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5"
                        />
                        {additionalImages.length > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{additionalImages.length} file(s) selected</p>
                        )}
                        <button
                          onClick={handleUploadImages}
                          disabled={uploadingImages || additionalImages.length === 0}
                          className="w-full py-2 text-xs font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:bg-gray-300 transition"
                        >
                          {uploadingImages ? 'Uploading…' : 'Upload images'}
                        </button>
                      </div>
                    )}

                    {/* Variants tab */}
                    {manageTab === 'variants' && (
                      <div className="space-y-3">
                        {variantsLoading ? (
                          <p className="text-xs text-gray-400">Loading variants…</p>
                        ) : variants.length === 0 ? (
                          <p className="text-xs text-gray-400">No variants yet.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-36 overflow-y-auto">
                            {variants.map((v) => (
                              <div key={v.id} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-900 rounded-lg px-2 py-1.5">
                                <div>
                                  <span className="font-semibold text-gray-800 dark:text-gray-200">{v.sku}</span>
                                  <span className="text-gray-500 dark:text-gray-400 ml-1">— {Object.entries(v.attributes ?? {}).map(([k, val]) => `${k}: ${val}`).join(', ')}</span>
                                  <span className="text-gray-500 dark:text-gray-400 ml-1">stock: {v.stock}</span>
                                  {v.price != null && <span className="text-brand-600 ml-1">${v.price.toFixed(2)}</span>}
                                </div>
                                <button onClick={() => handleDeleteVariant(v.id)} className="text-red-400 hover:text-red-600 ml-2">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Add variant form */}
                        <div className="border border-gray-100 dark:border-gray-700 rounded-lg p-2 space-y-2 bg-gray-50 dark:bg-gray-900">
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Add variant</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              value={variantForm.attrKey}
                              onChange={(e) => setVariantForm((f) => ({ ...f, attrKey: e.target.value }))}
                              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 focus:outline-none"
                            >
                              <option value="color">Color</option>
                              <option value="size">Size</option>
                              <option value="storage">Storage</option>
                              <option value="material">Material</option>
                              <option value="style">Style</option>
                            </select>
                            <input
                              placeholder="Value (e.g. Red)"
                              value={variantForm.attrValue}
                              onChange={(e) => setVariantForm((f) => ({ ...f, attrValue: e.target.value }))}
                              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 focus:outline-none"
                            />
                            <input
                              placeholder="SKU"
                              value={variantForm.sku}
                              onChange={(e) => setVariantForm((f) => ({ ...f, sku: e.target.value }))}
                              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 focus:outline-none"
                            />
                            <input
                              placeholder="Stock"
                              type="number"
                              min="0"
                              value={variantForm.stock}
                              onChange={(e) => setVariantForm((f) => ({ ...f, stock: e.target.value }))}
                              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 focus:outline-none"
                            />
                            <input
                              placeholder="Price override (opt.)"
                              type="number"
                              min="0"
                              step="0.01"
                              value={variantForm.price}
                              onChange={(e) => setVariantForm((f) => ({ ...f, price: e.target.value }))}
                              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 focus:outline-none col-span-2"
                            />
                          </div>
                          <button
                            onClick={handleAddVariant}
                            disabled={addingVariant}
                            className="w-full py-1.5 text-xs font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:bg-gray-300 transition"
                          >
                            {addingVariant ? 'Adding…' : '+ Add variant'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 text-center">
            <div className="mb-4">
              <Trash2 className="mx-auto w-16 h-16 text-red-500 mb-4" />
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
                Confirm Delete
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to delete this product? This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

{isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Price
                  </label>
                  <input
                    type="text"
                    value={formData.price}
                    onChange={handlePriceChange}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Stock
                  </label>
                  <input
                    type="text"
                    value={formData.stock}
                    onChange={handleStockChange}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Product Image
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <Button
                  type="submit"
                  isLoading={isLoading}
                  icon={<Save className="w-5 h-5" />}
                  className="w-full"
                >
                  Save Product
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};