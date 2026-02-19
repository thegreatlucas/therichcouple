'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';
import { useEncryptedInsert } from '@/lib/useEncryptedInsert';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    icon: '📁',
    color: '#3498db'
  });
  const router = useRouter();
  const { encryptRecord } = useEncryptedInsert();

  const iconOptions = ['🍔', '🚗', '🏠', '💡', '🎮', '👕', '💊', '✈️', '🎬', '📚', '🏋️', '🐶', '💰', '🎁', '📱'];
  const colorOptions = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#34495e', '#e67e22'];

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: memberData, error: memberError } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .single();

    if (memberError || !memberData) {
      alert('Nenhum household encontrado para seu usuário. Faça o setup primeiro.');
      router.push('/setup');
      return;
    }

    setHouseholdId(memberData.household_id);
    // BUG FIX: passa o id diretamente em vez de depender do estado
    loadCategories(memberData.household_id);
  }

  async function loadCategories(hid: string) {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('household_id', hid)
      .order('name');

    if (error) {
      console.error('Erro ao carregar categorias:', error);
      setLoading(false);
      return;
    }

    setCategories(data || []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Digite um nome para a categoria');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: memberData, error: memberError } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .single();

    if (memberError || !memberData) {
      alert('Household não encontrado. Faça o setup primeiro.');
      return;
    }

    const currentHouseholdId = memberData.household_id;

    if (editingId) {
      const payload = await encryptRecord({
        name: formData.name,
        icon: formData.icon,
        color: formData.color,
      });
      const { error } = await supabase
        .from('categories')
        .update(payload)
        .eq('id', editingId);

      if (error) { alert('Erro ao atualizar categoria: ' + error.message); return; }
    } else {
      const payload = await encryptRecord({
        name: formData.name,
        icon: formData.icon,
        color: formData.color,
        household_id: currentHouseholdId,
      });
      const { error } = await supabase.from('categories').insert(payload);
      if (error) { alert('Erro ao criar categoria: ' + error.message); return; }
    }

    setFormData({ name: '', icon: '📁', color: '#3498db' });
    setEditingId(null);
    setShowForm(false);
    loadCategories(currentHouseholdId);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Tem certeza que deseja deletar a categoria "${name}"?`)) return;

    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) { alert('Erro ao deletar: ' + error.message); return; }
    if (householdId) loadCategories(householdId);
  }

  function startEdit(category: any) {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      icon: category.icon || '📁',
      color: category.color || '#3498db'
    });
    setShowForm(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setFormData({ name: '', icon: '📁', color: '#3498db' });
    setShowForm(false);
  }

  if (loading) {
    return <main style={{ padding: 16 }}>Carregando...</main>;
  }

  return (
    <>
      <Header title="Categorias" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>Categorias</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '8px 16px',
            fontSize: 16,
            backgroundColor: showForm ? '#e74c3c' : '#2ecc71',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          {showForm ? '✖️ Cancelar' : '➕ Nova categoria'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          style={{ backgroundColor: '#f5f5f5', padding: 20, borderRadius: 8, marginBottom: 24 }}
        >
          <h3 style={{ marginTop: 0 }}>
            {editingId ? 'Editar Categoria' : 'Nova Categoria'}
          </h3>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Nome:</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Alimentação"
              style={{ width: '100%', padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Ícone:</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {iconOptions.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setFormData({ ...formData, icon })}
                  style={{
                    fontSize: 24,
                    padding: 8,
                    border: formData.icon === icon ? '2px solid #3498db' : '1px solid #ddd',
                    borderRadius: 8,
                    backgroundColor: formData.icon === icon ? '#e3f2fd' : 'white',
                    cursor: 'pointer'
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Cor:</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {colorOptions.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  style={{
                    width: 40,
                    height: 40,
                    backgroundColor: color,
                    border: formData.color === color ? '3px solid #333' : '1px solid #ddd',
                    borderRadius: 8,
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              style={{ padding: '10px 20px', fontSize: 16, backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >
              {editingId ? '💾 Salvar' : '➕ Criar'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              style={{ padding: '10px 20px', fontSize: 16, backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div>
        {categories.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#666', padding: 32 }}>
            Nenhuma categoria criada ainda. Clique em &quot;Nova categoria&quot; para começar!
          </p>
        ) : (
          categories.map((cat) => (
            <div
              key={cat.id}
              style={{
                border: '1px solid #ddd',
                padding: 16,
                marginBottom: 12,
                borderRadius: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'white'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    fontSize: 32,
                    width: 50,
                    height: 50,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: cat.color || '#3498db',
                    borderRadius: 8
                  }}
                >
                  {cat.icon || '📁'}
                </div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 18 }}>{cat.name}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    Criado em {new Date(cat.created_at).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => startEdit(cat)}
                  style={{ padding: '8px 12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => handleDelete(cat.id, cat.name)}
                  style={{ padding: '8px 12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <Link href="/dashboard">
          <button style={{ padding: '12px 24px', fontSize: 16 }}>⬅️ Voltar ao Dashboard</button>
        </Link>
      </div>
    </main>
  </>
  );
}