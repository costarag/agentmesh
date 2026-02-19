import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 10;

export interface SessionQueryParams {
  page?: number;
  search?: string;
  sourceToolId?: string;
  modelKey?: string;
  from?: string;
  to?: string;
}

function normalizeSearch(search: string | undefined) {
  const trimmed = search?.trim();
  if (!trimmed || trimmed.length < 2) {
    return undefined;
  }
  return trimmed;
}

export async function getSessions(params: SessionQueryParams) {
  const page = Math.max(params.page ?? 1, 1);
  const skip = (page - 1) * PAGE_SIZE;
  const search = normalizeSearch(params.search);
  const model = params.modelKey ? splitModelKey(params.modelKey) : undefined;

  const where = {
    ...(params.sourceToolId ? { sourceToolId: params.sourceToolId } : {}),
    ...(model
      ? {
          messages: {
            some: {
              ...(model.provider ? { modelProvider: model.provider } : {}),
              ...(model.modelId ? { modelId: model.modelId } : {}),
            },
          },
        }
      : {}),
    ...(params.from || params.to
      ? {
          createdAt: {
            ...(params.from ? { gte: new Date(params.from) } : {}),
            ...(params.to ? { lte: new Date(params.to) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            {
              messages: {
                some: {
                  content: { contains: search, mode: "insensitive" as const },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [total, sessions] = await Promise.all([
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      skip,
      take: PAGE_SIZE,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        sourceTool: true,
        workspace: true,
        messages: {
          orderBy: {
            sourceTimestamp: "desc",
          },
          take: 1,
          select: {
            modelProvider: true,
            modelId: true,
            content: true,
            role: true,
            sourceTimestamp: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    }),
  ]);

  return {
    sessions,
    page,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getSessionById(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      sourceTool: true,
      workspace: true,
      messages: {
        orderBy: {
          ordinal: "asc",
        },
        include: {
          parts: {
            orderBy: {
              ordinal: "asc",
            },
          },
        },
      },
      tasks: {
        orderBy: {
          createdAt: "desc",
        },
      },
      artifacts: {
        orderBy: {
          createdAt: "asc",
        },
      },
      metricSnapshots: {
        orderBy: {
          recordedAt: "desc",
        },
        take: 1,
      },
      tags: {
        include: {
          tag: true,
        },
      },
    },
  });
}

export async function getSessionFilters() {
  const [sourceTools, workspaces, modelRows] = await Promise.all([
    prisma.sourceTool.findMany({
      where: {
        sessions: {
          some: {},
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.workspace.findMany({ orderBy: { name: "asc" } }),
    prisma.message.findMany({
      where: {
        OR: [{ modelProvider: { not: null } }, { modelId: { not: null } }],
      },
      select: {
        modelProvider: true,
        modelId: true,
      },
      distinct: ["modelProvider", "modelId"],
      orderBy: [{ modelProvider: "asc" }, { modelId: "asc" }],
    }),
  ]);

  type ModelRow = (typeof modelRows)[number];
  const models = modelRows
    .map((row: ModelRow) => {
      const provider = row.modelProvider?.trim() ?? "";
      const modelId = row.modelId?.trim() ?? "";
      if (!provider && !modelId) {
        return null;
      }

      const key = `${provider}/${modelId}`;
      const label =
        provider && modelId ? `${provider} / ${modelId}` : provider || modelId;
      return { key, label };
    })
    .filter(
      (
        row: { key: string; label: string } | null,
      ): row is { key: string; label: string } => Boolean(row),
    );

  return { sourceTools, workspaces, models };
}

function splitModelKey(modelKey: string) {
  const [provider, ...rest] = modelKey.split("/");
  const modelId = rest.join("/");
  return {
    provider: provider || undefined,
    modelId: modelId || undefined,
  };
}
