export type Couple = {
  id: string;
  invite_code: string;
  started_on: string | null;
  created_by: string;
  created_at: string;
  pet_name: string;
  pet_kind: PetKind;
  pet_pats: number;
};

export type PetKind = 'cat' | 'dog' | 'bunny' | 'bear';

export type Profile = {
  id: string;
  display_name: string;
  couple_id: string | null;
  mood: string | null;
  mood_note: string | null;
  mood_updated_at: string | null;
  last_seen_at?: string | null;
  /** Как я называю партнёра (видно только в моём приложении) */
  partner_nickname?: string | null;
  /** Выключенные виды уведомлений: { reactions: false } */
  notify_prefs?: Record<string, boolean> | null;
  /** Обои чата: id готовых или 'photo:<путь>' */
  chat_wallpaper?: string | null;
};

export type CoupleEvent = {
  id: string;
  couple_id: string;
  title: string;
  date: string;
  emoji: string;
  repeats_yearly: boolean;
  note: string | null;
  created_by: string;
};

export type Question = {
  id: number;
  category: string;
  text: string;
};

export type Answer = {
  id: string;
  couple_id: string;
  question_id: number;
  user_id: string;
  body: string;
  created_at: string;
};

export type List = {
  id: string;
  couple_id: string;
  title: string;
  emoji: string;
  created_at: string;
};

export type ListItem = {
  id: string;
  list_id: string;
  couple_id: string;
  text: string;
  done: boolean;
  created_by: string;
  created_at: string;
};

export type Message = {
  id: string;
  couple_id: string;
  sender_id: string;
  body: string;
  kind: 'text' | 'thinking' | 'media' | 'voice';
  created_at: string;
  /** { user_id: emoji } — по одной реакции от каждого партнёра */
  reactions?: Record<string, string>;
  media_path?: string | null;
  media_type?: 'image' | 'video' | 'audio' | null;
  media_duration?: number | null;
  reply_to?: string | null;
  media_width?: number | null;
  media_height?: number | null;
  /** Только на этом устройстве, пока файл загружается */
  local_uri?: string;
  sending?: boolean;
};
