import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findUnique({
    where: { username: "admin" },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash("astha@2025", 12);
    await prisma.user.create({
      data: {
        username: "admin",
        password: hashedPassword,
        name: "Administrator",
      },
    });
    console.log("Admin user created: admin / astha@2025");
  } else {
    console.log("Admin user already exists");
  }

  const employeeCount = await prisma.employee.count();
  if (employeeCount === 0) {
    const deliveryStaff = [
      { name: "HIMMAT", type: "delivery", rate: 15.5 },
      { name: "JAKIR BHANO", type: "delivery", rate: 15.5 },
      { name: "HANIF", type: "delivery", rate: 21 },
      { name: "SULTAN", type: "delivery", rate: 21 },
      { name: "SALIM", type: "delivery", rate: 15.5 },
      { name: "BHARAT", type: "delivery", rate: 15.5 },
      { name: "JAKIR", type: "delivery", rate: 21 },
      { name: "MOIN", type: "delivery", rate: 15.5 },
      { name: "BHAVESH", type: "delivery", rate: 15.5 },
      { name: "RAJU", type: "delivery", rate: 15.5 },
    ];

    const officeStaff = [
      { name: "PUJA", type: "office", fixedSalary: 7500 },
      { name: "VIDHI", type: "office", fixedSalary: 7500 },
      { name: "ATULBHAI", type: "office", fixedSalary: 12000 },
      { name: "BHADRESH", type: "office", fixedSalary: 9150 },
      { name: "YUNUS", type: "office", fixedSalary: 13000 },
    ];

    for (const emp of deliveryStaff) {
      await prisma.employee.create({ data: emp });
    }
    for (const emp of officeStaff) {
      await prisma.employee.create({ data: emp });
    }
    console.log(
      `Seeded ${deliveryStaff.length} delivery + ${officeStaff.length} office staff`
    );
  } else {
    console.log(`${employeeCount} employees already exist`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
