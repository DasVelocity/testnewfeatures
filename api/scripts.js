import { sql } from '@vercel/postgres';
import { put } from '@vercel/blob';
import multiparty from 'multiparty';
import fs from 'fs/promises';

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const searchParams = url.searchParams;

  if (req.method === 'GET') {
    const id = searchParams.get('id');
    try {
      if (id) {
        const { rows } = await sql`SELECT * FROM scripts WHERE id = ${parseInt(id)}`;
        if (rows.length === 0) {
          return res.status(404).json({});
        }
        res.status(200).json(rows[0]);
      } else {
        const { rows } = await sql`SELECT * FROM scripts ORDER BY created_at DESC`;
        res.status(200).json(rows);
      }
    } catch (error) {
      if (error.message.includes('relation "scripts" does not exist')) {
        await sql`
          CREATE TABLE scripts (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            game_icon TEXT,
            game_name VARCHAR(255),
            thumbnail_url TEXT,
            code TEXT NOT NULL,
            author VARCHAR(255) NOT NULL,
            discord TEXT,
            likes INTEGER DEFAULT 0,
            dislikes INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
          );
        `;
        res.status(200).json([]);
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  } else if (req.method === 'POST') {
    const action = searchParams.get('action');
    if (action) {
      const id = parseInt(searchParams.get('id'));
      let query;
      if (action === 'like') {
        query = sql`UPDATE scripts SET likes = likes + 1 WHERE id = ${id} RETURNING likes`;
      } else if (action === 'dislike') {
        query = sql`UPDATE scripts SET dislikes = dislikes + 1 WHERE id = ${id} RETURNING dislikes`;
      }
      if (query) {
        const { rows } = await query;
        res.status(200).json({ [action]: rows[0][action === 'like' ? 'likes' : 'dislikes'] });
        return;
      }
    }

    const form = new multiparty.Form();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        return res.status(500).json({ error: 'Parse error' });
      }

      const title = fields.title?.[0];
      const gameIcon = fields.gameIcon?.[0];
      const gameName = fields.gameName?.[0];
      const code = fields.code?.[0];
      const author = fields.author?.[0];
      const discord = fields.discord?.[0] || null;
      const thumbnailFile = files.thumbnail?.[0];

      if (!title || !code || !author || !gameIcon || !gameName) {
        return res.status(400).json({ error: 'Missing fields' });
      }

      let thumbnailUrl = '';
      if (thumbnailFile) {
        try {
          const buffer = await fileToBuffer(thumbnailFile);
          const blob = await put(`thumbnails/${Date.now()}-${thumbnailFile.originalFilename}`, buffer, {
            access: 'public',
          });
          thumbnailUrl = blob.url;
        } catch (uploadErr) {
          return res.status(500).json({ error: 'Upload failed' });
        }
      }

      try {
        await sql`
          INSERT INTO scripts (title, game_icon, game_name, thumbnail_url, code, author, discord)
          VALUES (${title}, ${gameIcon}, ${gameName}, ${thumbnailUrl}, ${code}, ${author}, ${discord})
        `;
        res.status(201).json({ message: 'Published' });
      } catch (error) {
        res.status(500).json({ error: 'DB error' });
      }
    });
  } else {
    res.status(405).end('Method not allowed');
  }
}

async function fileToBuffer(file) {
  const buffer = await fs.readFile(file.path);
  await fs.unlink(file.path);
  return buffer;
}