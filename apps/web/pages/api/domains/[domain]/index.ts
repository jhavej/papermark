import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import prisma from "database";
import { authOptions } from "@/pages/api//auth/[...nextauth]";
import { log } from "@/lib/utils";
import { getApexDomain, removeDomainFromVercel } from "@/lib/domains";
import { CustomUser } from "@/lib/types";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "DELETE") {
    // DELETE /api/domains/:domain
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).end("Unauthorized");
    }

    // Assuming the domain slug is sent in the request body.
    const { domain } = req.query as { domain: string };


    // console.log("Deleting domain:", domain);

    if (!domain) {
      return res.status(400).json("Domain is required for deletion");
    }

    try {
      // calculate the domainCount
      const apexDomain = getApexDomain(`https://${domain}`);
      const domainCount = await prisma.domain.count({
        where: {
          OR: [
            {
              slug: apexDomain,
            },
            {
              slug: {
                endsWith: `.${apexDomain}`,
              },
            },
          ],
        },
      });

      const domainToBeDeleted = await prisma.domain.findFirst({
        where: {
          slug: domain,
          userId: (session.user as CustomUser).id,
        },
        select: {
          id: true,
        },
      });

      if (!domainToBeDeleted) {
        return res.status(404).json("Domain not found");
      }

      await Promise.allSettled([
        removeDomainFromVercel(domain, domainCount),
        prisma.domain.delete({
          where: {
            id: domainToBeDeleted.id,
          },
        }),
      ]);

      res.status(204).end();  // 204 No Content response for successful deletes
    } catch (error) {
      log(`Failed to delete domain: ${domain}. Error: \n\n ${error}`);
      res.status(500).json({
        message: "Internal Server Error",
        error: (error as Error).message
      });
    }
  } else {
    // We only allow POST requests
    res.setHeader("Allow", ["DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
