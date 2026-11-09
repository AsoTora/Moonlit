import { act, renderHook } from '@testing-library/react-native';

import { StoriesRepository } from '@/api/stories/stories';
import { AudioRecordingsDB } from '@/database';

import { useStoryAudioRecordingsUpdate } from '../useStoryAudioRecordingsUpdate';

jest.unmock('@/screens/StoryPlayerScreens/StoryPlayerScreen/hooks/useStoryAudioRecordingsUpdate');

jest.mock('@/api/stories/stories', () => ({
  StoriesRepository: {
    getAudioRecordings: jest.fn(),
  },
}));

jest.mock('@/database', () => ({
  AudioRecordingsDB: {
    delete: jest.fn(),
    objects: jest.fn(),
    upsert: jest.fn(),
  },
}));

const apiAudioRecording = {
  audio_url: 'Stories/Audio/story/grandpa.mp3',
  created_at_timestamp: '2026-01-01T00:00:00Z',
  duration: 120,
  id: 7,
  name: 'Grandpa',
  size: 1024,
  story_id: 3,
  updated_at_timestamp: '2026-01-02T00:00:00Z',
  voices: {
    cover_url: 'Stories/Audio/voice_covers/grandpa.png',
    id: 2,
    is_free: true,
    name: 'Grandpa',
  },
};

async function upsertedRecording(apiRecording: typeof apiAudioRecording) {
  (StoriesRepository.getAudioRecordings as jest.Mock).mockResolvedValue([apiRecording]);
  (AudioRecordingsDB.upsert as jest.Mock).mockResolvedValue([null, []]);
  (AudioRecordingsDB.objects as jest.Mock).mockReturnValue({ filtered: () => [] });

  await renderHook(() => useStoryAudioRecordingsUpdate(3));

  await act(async () => {
    await new Promise(setImmediate);
  });

  return (AudioRecordingsDB.upsert as jest.Mock).mock.calls[0][0][0];
}

describe('useStoryAudioRecordingsUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores server audio and cover URLs when the API provides them', async () => {
    const recording = await upsertedRecording({
      ...apiAudioRecording,
      audio_absolute_url: 'https://media.example.test/Stories/Audio/story/grandpa.mp3',
      voices: {
        ...apiAudioRecording.voices,
        cover_absolute_url: 'https://media.example.test/Stories/Audio/voice_covers/grandpa.png',
      },
    } as typeof apiAudioRecording);

    expect(recording).toMatchObject({
      audio_url: 'https://media.example.test/Stories/Audio/story/grandpa.mp3',
      cover_url: 'https://media.example.test/Stories/Audio/voice_covers/grandpa.png',
    });
  });

  it('keeps storage paths when the API does not provide URLs', async () => {
    const recording = await upsertedRecording(apiAudioRecording);

    expect(recording).toMatchObject({
      audio_url: 'Stories/Audio/story/grandpa.mp3',
      cover_url: 'Stories/Audio/voice_covers/grandpa.png',
    });
  });
});
