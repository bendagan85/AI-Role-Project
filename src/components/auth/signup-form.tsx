'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/auth/password-input';
import { createClient } from '@/lib/supabase/client';

const signupSchema = z.object({
  name: z.string().min(2, 'At least 2 characters').max(80, 'Too long'),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});

type SignupValues = z.infer<typeof signupSchema>;

export function SignupForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(values: SignupValues) {
    setPending(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { name: values.name },
      },
    });
    if (error) {
      setPending(false);
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      // Email confirmation is enabled on the project.
      setPending(false);
      toast.success('Check your inbox to confirm your email, then sign in.');
      router.push('/login');
      return;
    }
    router.push('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1">
        <Input placeholder="Your coach name (e.g. Coach Marcus)" {...register('name')} />
        {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
      </div>
      <div className="space-y-1">
        <Input
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          {...register('email')}
        />
        {errors.email && <p className="text-destructive text-xs">{errors.email.message}</p>}
      </div>
      <div className="space-y-1">
        <PasswordInput
          placeholder="Password (min 8 chars)"
          autoComplete="new-password"
          {...register('password')}
        />
        {errors.password && <p className="text-destructive text-xs">{errors.password.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating workspace…' : 'Create workspace'}
      </Button>
    </form>
  );
}
