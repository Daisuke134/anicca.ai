import { createClient } from '@/lib/supabase'

// Get auth headers for API requests
export async function getAuthHeaders() {
  console.log('🔐 getAuthHeaders: Starting...')
  
  const supabase = createClient()
  console.log('🔐 getAuthHeaders: Supabase client created')
  
  const { data: { session }, error } = await supabase.auth.getSession()
  console.log('🔐 getAuthHeaders: Session result:', {
    hasSession: !!session,
    hasError: !!error,
    error: error?.message,
    userId: session?.user?.id,
    hasToken: !!session?.access_token
  })
  
  if (!session) {
    console.log('🔐 getAuthHeaders: No session found, returning empty headers')
    return {}
  }
  
  const headers = {
    'Authorization': `Bearer ${session.access_token}`
  }
  console.log('🔐 getAuthHeaders: Returning headers with token')
  
  return headers
}

// Authenticated fetch wrapper
export async function authenticatedFetch(url: string, options: RequestInit = {}) {
  console.log('🌐 authenticatedFetch: Called for URL:', url)
  
  const authHeaders = await getAuthHeaders()
  console.log('🌐 authenticatedFetch: Got auth headers:', Object.keys(authHeaders))
  
  // Merge headers properly
  const headers = new Headers(options.headers)
  Object.entries(authHeaders).forEach(([key, value]) => {
    if (value && typeof value === 'string') {
      headers.set(key, value)
    }
  })
  
  console.log('🌐 authenticatedFetch: Making request with headers:', {
    hasAuthorization: headers.has('Authorization'),
    contentType: headers.get('Content-Type')
  })
  
  try {
    const response = await fetch(url, {
      ...options,
      headers
    })
    
    console.log('🌐 authenticatedFetch: Response status:', response.status)
    return response
  } catch (error) {
    console.error('🌐 authenticatedFetch: Error:', error)
    throw error
  }
}