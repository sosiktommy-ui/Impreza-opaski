import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const newPassword = 'Impreza@Admin2026!';
  const passwordHash = bcrypt.hashSync(newPassword, 12);

  // Найдём всех админов
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
  });
  
  console.log('Найдено админов:', admins.length);
  admins.forEach(a => console.log(`  - ${a.username} (${a.email})`));

  // Обновим пароль для всех админов
  const updated = await prisma.user.updateMany({
    where: { role: 'ADMIN' },
    data: { passwordHash },
  });

  if (updated.count > 0) {
    console.log('\n✅ Пароль обновлён для', updated.count, 'админов!');
    console.log('   Новый пароль: Impreza@Admin2026!');
  } else {
    // Попробуем найти любого пользователя и обновить
    const anyUser = await prisma.user.findFirst();
    if (anyUser) {
      console.log('Найден пользователь:', anyUser.username, anyUser.email);
      await prisma.user.update({
        where: { id: anyUser.id },
        data: { passwordHash, role: 'ADMIN' },
      });
      console.log('✅ Пароль обновлён!');
      console.log('   Логин:', anyUser.username);
      console.log('   Пароль: Impreza@Admin2026!');
    } else {
      console.log('❌ Пользователей в базе нет');
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
