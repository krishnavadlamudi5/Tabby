import { User } from '../models/User';
import { Group } from '../models/Group';

/**
 * The set of users a caller is allowed to see:
 *  - themselves,
 *  - their friends (their own friendIds),
 *  - people who added them as a friend (so shared expenses show real names),
 *  - members of any group they belong to.
 *
 * `phone` is only returned for the caller and for users in the caller's own
 * friend list; the password hash is never selected (select: false on the model).
 *
 * When `restrictToIds` is given, the result is further limited to those ids.
 */
export async function findVisibleUsers(userId: string, restrictToIds?: string[]): Promise<Record<string, any>[]> {
  const [me, groups] = await Promise.all([
    User.findOne({ id: userId }),
    Group.find({ members: userId }, { members: 1 }),
  ]);

  const myFriendIds = new Set<string>(me?.friendIds || []);
  const visibleIds = new Set<string>([userId, ...myFriendIds]);
  for (const g of groups) for (const m of g.members) visibleIds.add(m);

  let idFilter: string[] = Array.from(visibleIds);
  if (restrictToIds) {
    const wanted = new Set(restrictToIds);
    idFilter = idFilter.filter((id) => wanted.has(id));
  }

  const query = restrictToIds
    ? { id: { $in: idFilter } }
    : { $or: [{ id: { $in: idFilter } }, { friendIds: userId }] };

  const users = await User.find(query);

  return users.map((u) => {
    const obj = u.toJSON() as Record<string, any>;
    delete obj.password;
    if (obj.id !== userId && !myFriendIds.has(obj.id)) {
      delete obj.phone;
    }
    return obj;
  });
}
