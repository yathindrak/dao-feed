import { snapshotUser, snapshotVote, snapshotProposal } from '@/lib/db/schema';
import { desc, sql, count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}
const client = postgres(process.env.POSTGRES_URL);
const db = drizzle(client);

interface LeaderboardUser {
  id: string;
  name: string | null;
  avatar: string | null;
  votesCount: any;
  proposalsCount: any;
}

export default async function LeaderboardPage() {
  // Aggregate votes and proposals per user
  const usersWithActivity = await db
    .select({
      id: snapshotUser.id,
      name: snapshotUser.name,
      avatar: snapshotUser.avatar,
      votesCount: sql<number>`cast(count(distinct ${snapshotVote.id}) as integer)`,
      proposalsCount: sql<number>`cast(count(distinct ${snapshotProposal.id}) as integer)`,
    })
    .from(snapshotUser)
    .leftJoin(snapshotVote, eq(snapshotUser.id, snapshotVote.voter))
    .leftJoin(snapshotProposal, eq(snapshotUser.id, snapshotProposal.author))
    .groupBy(snapshotUser.id, snapshotUser.name, snapshotUser.avatar)
    .orderBy(
      desc(sql<number>`cast(count(distinct ${snapshotVote.id}) as integer)`),
      desc(
        sql<number>`cast(count(distinct ${snapshotProposal.id}) as integer)`,
      ),
    )
    .limit(20);

  const topUsers = usersWithActivity;

  console.log({ topUsers });

  const noActivity =
    topUsers.length > 0 &&
    Number(topUsers[0].votesCount ?? 0) === 0 &&
    Number(topUsers[0].proposalsCount ?? 0) === 0;

  return (
    <div className="container mx-auto py-8 px-4 md:px-0">
      <h1 className="text-3xl font-bold mb-8 text-center text-white">
        Live DAO Contributor Leaderboard
      </h1>
      {topUsers.length === 0 ? (
        <p className="text-center text-gray-500 mt-10">
          No user data available to display leaderboard.
        </p>
      ) : noActivity ? (
        <p className="text-center text-gray-500 mt-10">
          No activity to show on the leaderboard yet.
        </p>
      ) : (
        <div className="overflow-x-auto shadow-2xl rounded-lg">
          <table className="min-w-full bg-gray-800 rounded-lg">
            <thead className="bg-gray-700">
              <tr>
                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">
                  Rank
                </th>
                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">
                  User
                </th>
                <th className="py-3 px-4 text-right text-sm font-semibold text-gray-300 uppercase tracking-wider">
                  Votes
                </th>
                <th className="py-3 px-4 text-right text-sm font-semibold text-gray-300 uppercase tracking-wider">
                  Proposals
                </th>
              </tr>
            </thead>
            <tbody className="text-gray-400 divide-y divide-gray-700">
              {topUsers.map((user: LeaderboardUser, index: number) => (
                <tr
                  key={user.id}
                  className="hover:bg-gray-700 transition-colors duration-150"
                >
                  <td className="py-4 px-4 whitespace-nowrap">{index + 1}</td>
                  <td className="py-4 px-4 whitespace-nowrap">
                    <div className="flex items-center font-mono text-sm">
                      <span>{user.id}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-right whitespace-nowrap">
                    {Number(user.votesCount ?? 0).toLocaleString()}
                  </td>
                  <td className="py-4 px-4 text-right whitespace-nowrap">
                    {Number(user.proposalsCount ?? 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
