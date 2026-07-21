import webpush from 'web-push'

export default async function handler(req, res) {
  if (req.method === 'POST' && (req.url?.includes('subscribe') || req.query?.subscribe)) {
    return handleSubscribe(req, res)
  }
  if (req.method === 'POST') {
    return handleNotify(req, res)
  }
  if (req.method === 'GET') {
    return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' })
  }
  return res.status(405).json({ error: 'Method not allowed' })
}

async function handleSubscribe(req, res) {
  const { subscription, userId } = req.body
  if (!subscription?.endpoint || !userId) {
    return res.status(400).json({ error: 'Missing subscription or userId' })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase config missing' })
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  }

  try {
    const existing = await fetch(
      `${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${userId}&endpoint=eq.${encodeURIComponent(subscription.endpoint)}`,
      { headers }
    )
    const rows = await existing.json()

    if (rows.length > 0) {
      await fetch(
        `${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${rows[0].id}`,
        { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ subscription: JSON.stringify(subscription), updated_at: new Date().toISOString() }) }
      )
    } else {
      await fetch(
        `${supabaseUrl}/rest/v1/push_subscriptions`,
        { method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ user_id: userId, endpoint: subscription.endpoint, subscription: JSON.stringify(subscription) }) }
      )
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Subscribe error:', err)
    return res.status(500).json({ error: 'Failed to save subscription' })
  }
}

async function handleNotify(req, res) {
  const { userId, title, body, url, tag } = req.body
  if (!title) return res.status(400).json({ error: 'Missing title' })

  const vapidPublic = process.env.VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com'
  if (!vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: 'VAPID keys not configured' })
  }

  webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate)

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase config missing' })
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  }

  try {
    let query = `${supabaseUrl}/rest/v1/push_subscriptions?select=*`
    if (userId) query += `&user_id=eq.${userId}`

    const subRes = await fetch(query, { headers })
    const subs = await subRes.json()
    if (!Array.isArray(subs) || subs.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No subscriptions found' })
    }

    const payload = JSON.stringify({ title, body, url, tag })
    let sent = 0
    const expired = []

    for (const sub of subs) {
      try {
        const subscription = JSON.parse(sub.subscription)
        await webpush.sendNotification(subscription, payload)
        sent++
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          expired.push(sub.id)
        }
        console.error('Push error for sub', sub.id, err.statusCode || err.message)
      }
    }

    if (expired.length > 0) {
      for (const id of expired) {
        await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${id}`, {
          method: 'DELETE', headers
        }).catch(() => {})
      }
    }

    return res.status(200).json({ sent, expired: expired.length })
  } catch (err) {
    console.error('Notify error:', err)
    return res.status(500).json({ error: 'Notification failed' })
  }
}
