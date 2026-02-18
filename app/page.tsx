'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Todo = {
  id: number;
  title: string;
};

export default function Home() {
  const [todos, setTodos] = useState<Todo[]>([]);

  useEffect(() => {
    async function loadTodos() {
      const { data, error } = await supabase.from('todos').select('*');
      if (error) {
        console.error(error);
        return;
      }
      setTodos(data || []);
    }
    loadTodos();
  }, []);

  return (
    <main style={{ padding: 16 }}>
      <h1>Teste Supabase</h1>
      {todos.map((todo) => (
        <p key={todo.id}>{todo.title}</p>
      ))}
    </main>
  );
}
