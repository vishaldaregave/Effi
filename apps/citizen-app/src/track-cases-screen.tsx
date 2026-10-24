import { makeFunctionReference, type PaginationOptions, type PaginationResult } from "convex/server";
import { usePaginatedQuery } from "convex/react";
import { useRouter } from "expo-router";
import { FilePlus2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CitizenReportCard } from "@/components/citizen-report-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { useColor } from "@/hooks/useColor";
import type { ViewerCase } from "@/viewer-case";

const viewerCaseHistory = makeFunctionReference<
  "query",
  { paginationOpts: PaginationOptions },
  PaginationResult<ViewerCase>
>("citizen:viewerCaseHistory");

const pageSize = 20;

export function TrackCasesScreen() {
  const router = useRouter();
  const background = useColor("homeCanvas");
  const text = useColor("foreground");
  const muted = useColor("textMuted");
  const { results, status, loadMore } = usePaginatedQuery(viewerCaseHistory, {}, { initialNumItems: pageSize });
  const [now] = useState(() => Date.now());

  const loadNextPage = useCallback(() => {
    if (status === "CanLoadMore") loadMore(pageSize);
  }, [loadMore, status]);

  if (status === "LoadingFirstPage") {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: background }]}>
        <View style={styles.loadingState}>
          <Spinner label="Loading your reports" showLabel />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: background }]}>
      <FlatList
        data={results}
        keyExtractor={(entry) => entry.caseId}
        renderItem={({ item }) => (
          <CitizenReportCard
            entry={item}
            now={now}
            onPress={() => router.push({ pathname: "/cases/[caseId]", params: { caseId: item.caseId } })}
            standalone
          />
        )}
        contentContainerStyle={[styles.content, results.length === 0 && styles.emptyContent]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: text }]}>Track reports</Text>
            <Text style={[styles.subtitle, { color: muted }]}>Every report you have submitted, with its latest status.</Text>
          </View>
        )}
        ListEmptyComponent={(
          <Card style={styles.emptyCard}>
            <CardHeader>
              <CardTitle>No reports yet</CardTitle>
            </CardHeader>
            <CardContent style={styles.emptyActions}>
              <Text variant="caption">Submit an issue and track its progress here.</Text>
              <Button icon={FilePlus2} onPress={() => router.push("/main/report")}>Report an issue</Button>
            </CardContent>
          </Card>
        )}
        ListFooterComponent={status === "LoadingMore" ? (
          <View style={styles.pageLoader}>
            <Spinner label="Loading more reports" showLabel />
          </View>
        ) : null}
        onEndReached={loadNextPage}
        onEndReachedThreshold={0.35}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  emptyContent: { flexGrow: 1 },
  header: { gap: 5, marginBottom: 22 },
  title: { fontSize: 32, fontWeight: "800", letterSpacing: -0.8, lineHeight: 38 },
  subtitle: { fontSize: 15, lineHeight: 21, maxWidth: 330 },
  separator: { height: 12 },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  pageLoader: { paddingVertical: 24, alignItems: "center" },
  emptyCard: { marginTop: 6 },
  emptyActions: { gap: 16 },
});
