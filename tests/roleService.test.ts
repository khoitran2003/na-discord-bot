import './helpers/mockPrisma';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GuildMember } from 'discord.js';
import { filterQualifiedViewers } from '../src/services/roleService';

interface MockMemberOptions {
  id: string;
  bot?: boolean;
  deaf?: boolean;
  selfDeaf?: boolean;
  serverDeaf?: boolean;
  createdTimestamp: number;
  joinedTimestamp: number | null;
}

function makeMember(opts: MockMemberOptions): GuildMember {
  return {
    id: opts.id,
    user: {
      bot: opts.bot ?? false,
      createdTimestamp: opts.createdTimestamp,
    },
    voice: {
      deaf: opts.deaf ?? false,
      selfDeaf: opts.selfDeaf ?? false,
      serverDeaf: opts.serverDeaf ?? false,
    },
    joinedTimestamp: opts.joinedTimestamp,
  } as unknown as GuildMember;
}

describe('roleService.filterQualifiedViewers', () => {
  const nowMs = Date.UTC(2026, 5, 1, 12, 0, 0);
  const oldAcc = nowMs - 30 * 86_400_000; // 30 ngày
  const oldGuild = nowMs - 72 * 3_600_000; // 72 giờ

  it('loại trừ host, bot, deaf/selfDeaf/serverDeaf, acc mới, guild mới (kể cả null), và activeHostUserIds', () => {
    const members: GuildMember[] = [
      // Host -> không tính vào rawViewerCount lẫn qualifiedMembers
      makeMember({ id: 'host-1', createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      // Bot -> không tính vào rawViewerCount lẫn qualifiedMembers
      makeMember({ id: 'bot-1', bot: true, createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      // Deaf / selfDeaf / serverDeaf -> tính rawViewerCount, loại khỏi qualifiedMembers
      makeMember({ id: 'v-deaf', deaf: true, createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeMember({ id: 'v-self-deaf', selfDeaf: true, createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeMember({ id: 'v-server-deaf', serverDeaf: true, createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      // Account age < 7 ngày (3 ngày) -> tính rawViewerCount, loại khỏi qualifiedMembers
      makeMember({ id: 'v-new-acc', createdTimestamp: nowMs - 3 * 86_400_000, joinedTimestamp: oldGuild }),
      // Guild age < 24 giờ (10 giờ) -> tính rawViewerCount, loại khỏi qualifiedMembers
      makeMember({ id: 'v-new-guild', createdTimestamp: oldAcc, joinedTimestamp: nowMs - 10 * 3_600_000 }),
      // joinedTimestamp: null -> tính rawViewerCount, loại khỏi qualifiedMembers
      makeMember({ id: 'v-null-join', createdTimestamp: oldAcc, joinedTimestamp: null }),
      // Đang là host ở phòng khác -> tính rawViewerCount, loại khỏi qualifiedMembers
      makeMember({ id: 'host-2', createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      // Viewer hợp lệ
      makeMember({ id: 'v-ok-1', createdTimestamp: oldAcc, joinedTimestamp: oldGuild }),
      makeMember({ id: 'v-ok-2', createdTimestamp: nowMs - 7 * 86_400_000, joinedTimestamp: nowMs - 24 * 3_600_000 }),
    ];

    const result = filterQualifiedViewers(members, 'host-1', {
      minAccountAgeDays: 7,
      minGuildAgeHours: 24,
      activeHostUserIds: new Set(['host-1', 'host-2']),
      nowMs,
    });

    // rawViewerCount = 11 tổng - 1 host - 1 bot = 9
    assert.equal(result.rawViewerCount, 9);
    assert.deepEqual(
      result.qualifiedMembers.map((m) => m.id),
      ['v-ok-1', 'v-ok-2']
    );
  });
});
