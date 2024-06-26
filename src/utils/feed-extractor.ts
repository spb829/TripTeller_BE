import { NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DailySchedule } from 'src/daily-schedule/daily-schedule.schema';
import Feed, { FeedDocument } from 'src/feed/feed.schema';
import Scrap from 'src/scrap/scrap.schema';
import { RegionName } from 'src/travel-plan/region-name.enum';
import { TravelPlan } from 'src/travel-plan/travel-plan.schema';
import { User } from 'src/user/user.schema';

export class FeedExtractor {
  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Feed') private readonly feedModel: Model<Feed>,
    @InjectModel('TravelPlan') private readonly travelPlanModel: Model<TravelPlan>,
    @InjectModel('Scrap') private readonly scrapModel: Model<Scrap>,
  ) {}

  // 로그인한 회원과 글 작성자가 일치하는지 판별하는 함수
  checkUser = async (feedId: string, userId: string) => {
    const feed = await this.feedModel.findOne({ _id: feedId }).exec();
    if (feed.userId !== userId) {
      throw new NotFoundException('로그인한 회원과 게시물 작성자가 일치하지 않습니다.');
    }
  };

  // 회원 ID로 작성자 검색하기
  getUserByUserId = async (userId: string) => {
    const user = await this.userModel.findOne({ _id: userId }).exec();
    return user;
  };

  // 회원 ID로 게시글 검색하기
  findFeedsByUserId = async (userId: string): Promise<FeedDocument[]> => {
    return await this.feedModel
      .find({
        userId,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      })
      .exec();
  };

  // 페이지네이션 설정하는 함수
  getFeedPaginated = async (pageNumber: number = 1, pageSize: number = 9, criteria: any = {}) => {
    const skip = (pageNumber - 1) * pageSize;

    try {
      const feeds = await this.feedModel.aggregate([
        { $match: criteria },
        {
          $facet: {
            metadata: [{ $count: 'totalCount' }],
            data: [{ $skip: skip }, { $limit: pageSize }],
          },
        },
      ]);

      const totalCount = feeds[0].metadata.length > 0 ? feeds[0].metadata[0].totalCount : 0;

      const result = {
        success: true,
        feeds: {
          metadata: { totalCount, pageNumber, pageSize },
          data: feeds[0].data,
        },
      };

      return result;
    } catch (error) {
      throw new Error('페이지네이션 작업이 실패하였습니다.');
    }
  };

  // 게시물 정렬 기준 설정하는 함수
  findFeedsByCriteria = async (criteria: any) => {
    return this.feedModel.find(criteria).exec();
  };

  // 스크랩 여부 확인 함수 추가
  // 스크랩 되어 있으면 true, 안 되어 있으면 false
  isScrappedByUser = async (feedId: string, userId?: string) => {
    if (!userId) return false; // 로그인 상태가 아니면 false 반환
    const scrap = await this.scrapModel.findOne({ feedId, userId }).exec();
    return scrap ? true : false;
  };

  // 원하는 형태로 리턴값 추출
  // 우리의 여행에서의 게시글 형태
  // travelPlan이 없는 경우는 제외
  // async addVirtualsToTravelPlan(travelPlan: TravelPlan): Promise<[Date | null, Date | null]> {
  //   let tempStartDate;
  //   let tempEndDate;

  //   if (travelPlan.dailyPlans) {
  //     const dates = travelPlan.dailyPlans
  //       .filter((dailyPlan) => dailyPlan.dateType === 'DATE')
  //       .map((dailyPlan) => dailyPlan.date)
  //       .sort((a, b) => a.getTime() - b.getTime());

  //     tempStartDate = dates[0] || null;
  //     tempEndDate = dates[dates.length - 1] || null;
  //     console.log('extract 함수의 startDate', tempStartDate);
  //     console.log('extract 함수의 startDate', tempEndDate);
  //     return [tempStartDate, tempEndDate];
  //   }
  // }

  extractFeeds = async (feeds: FeedDocument[], userId?: string) => {
    const extractFeed = async (feed: FeedDocument) => {
      const { likeCount, travelPlan: _travelPlan, coverImage, isPublic } = feed;
      if (!_travelPlan) return null;

      const travelPlan = await this.travelPlanModel.findOne({ _id: _travelPlan['_id'] }).exec();
      if (!travelPlan) {
        console.error('★★★travelPlan not found: ', _travelPlan['_id']);
        return;
      }

      // console.log(_travelPlan.dailyPlans);
      // console.log(travelPlan.dailyPlans);

      // console.log('★★★feed 출력', feed);

      // const dailyPlansIds = travelPlan.dailyPlans.map((plan) => plan['_id']);
      // const dailyPlans = await this.dailyPlanModel.find({ _id: { $in: dailyPlansIds } }).exec();

      // 이 TravelPlan의 모든 DailySchedule을 가져옴
      const dailySchedules: DailySchedule[] = travelPlan.dailyPlans // => DailyPlan[]
        .map((dailyPlan) => dailyPlan.dailySchedules) // => DailySchedule[][]
        .flat(); // => DailySchedule[]

      // console.log('★★★travelPlan.dailyPlans', dailyPlans);
      // console.log('★★★dailySchedules', dailySchedules);

      let thumbnailUrl = null; // 썸네일 URL
      // DailySchedule 중 썸네일 이미지가 있고, isThumbnail이 true인 DailySchedule을 찾아 썸네일 URL을 추출
      const isThumbnailDailySchedule = dailySchedules.find((dailySchedule) => dailySchedule.isThumbnail);
      if (isThumbnailDailySchedule && isThumbnailDailySchedule.imageUrl) {
        thumbnailUrl = isThumbnailDailySchedule.imageUrl;
      }
      const startDate = travelPlan.startDate;
      const endDate = travelPlan.endDate;

      console.log('★★★FeedExtractor startDate', startDate);
      console.log('★★★FeedExtractor endDate', endDate);

      // isThumnbail이 true인 DailySchedule이 없을 경우
      if (!thumbnailUrl) {
        // imgUrl이 있는 아무 DailySchedule을 찾아 썸네일 URL을 추출
        const dailySchedule = dailySchedules.find((dailySchedule) => dailySchedule.imageUrl);

        // console.log('★★★if문 안에서 dailySchedule', dailySchedule);

        thumbnailUrl = dailySchedule?.imageUrl ?? null;

        // console.log('★★★if문 안에서 썸네일Url', thumbnailUrl);
      }

      // console.log('★★★썸네일Url', thumbnailUrl);

      // 해당 게시물 스크랩 여부 확인
      const isScrapped = await this.isScrappedByUser(feed._id.toString(), userId || null);

      return {
        feedId: feed._id, // 게시물 ID 값
        travelPlanId: feed.travelPlan['_id'], // travelPlan ID값
        userId: feed.userId, // 회원 ID 값
        createdAt: feed.createdAt, // 게시물 작성일
        isPublic, // 공개 여부
        likeCount, // 좋아요(스크랩) 개수
        title: travelPlan.title, // 제목
        region: travelPlan.region as RegionName, // 지역
        startDate, // 시작일
        endDate, // 종료일
        thumbnailUrl, // TravelLog 이미지 중 썸네일 URL
        coverImage, // 게시물 커버 이미지 URL
        isScrapped, // 해당 게시물 스크랩 여부
      };
    };

    return (
      await Promise.all(
        feeds
          .filter((feed) => !feed.deletedAt) // deletedAt이 없는 경우 = 삭제되지 않은 경우
          .map(async (feed) => {
            // feed를 extractFeed로 만드는 함수
            const _extractedFeed = await extractFeed(feed);

            return _extractedFeed;
          }), // => ExtractedFeed[]
      )
    ).filter((feed) => feed !== null); // null인 경우는 제외
  };
}
