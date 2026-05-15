import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findUnique({
    where: { username: "admin" },
  });

  if (!existingAdmin) {
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
    if (!initialPassword) {
      console.error(
        "Refusing to create admin user without ADMIN_INITIAL_PASSWORD set in env. " +
          "Set it to a strong password, run seed again, then unset it."
      );
      process.exit(1);
    }
    const hashedPassword = await bcrypt.hash(initialPassword, 12);
    await prisma.user.create({
      data: {
        username: "admin",
        password: hashedPassword,
        name: "Administrator",
      },
    });
    console.log("Admin user created with password from ADMIN_INITIAL_PASSWORD");
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

  // Seed cylinder types
  const cylinderCount = await prisma.cylinderType.count();
  if (cylinderCount === 0) {
    const types = [
      { name: "14.2 KG", price: 15.5, sortOrder: 0 },
      { name: "19 KG", price: 21, sortOrder: 1 },
      { name: "5 KG", price: 10, sortOrder: 2 },
      { name: "47.5 KG", price: 25, sortOrder: 3 },
    ];
    for (const ct of types) {
      await prisma.cylinderType.create({ data: ct });
    }
    console.log(`Seeded ${types.length} cylinder types`);
  } else {
    console.log(`${cylinderCount} cylinder types already exist`);
  }

  // Seed OTP bonus setting
  const otpSetting = await prisma.appSetting.findUnique({
    where: { key: "otp_bonus" },
  });
  if (!otpSetting) {
    await prisma.appSetting.create({
      data: { key: "otp_bonus", value: "2" },
    });
    console.log("OTP bonus setting created: ₹2");
  } else {
    console.log(`OTP bonus setting exists: ₹${otpSetting.value}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
